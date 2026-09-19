#!/usr/bin/env ruby
# frozen_string_literal: true

require "open3"
require "pathname"
require "yaml"

root = Pathname.new(__dir__).join("../..").cleanpath
Dir.chdir(root)

upstream = ARGV[0] || ENV["CHECK_BASE"] || "upstream/main"
customizations = YAML.safe_load(File.read(".fork/customizations.yml"), permitted_classes: [], aliases: false)
hooks = YAML.safe_load(File.read(".fork/private-hooks.yml"), permitted_classes: [], aliases: false)

def git!(*args)
  out, err, status = Open3.capture3("git", *args)
  abort err unless status.success?
  out
end

def covered?(pattern, path)
  prefix = pattern.end_with?("/**") ? pattern.delete_suffix("/**") : nil
  File.fnmatch?(pattern, path, File::FNM_PATHNAME | File::FNM_EXTGLOB) ||
    (prefix && (path == prefix || path.start_with?("#{prefix}/")))
end

patterns = customizations.fetch("customizations").flat_map { |entry| entry.fetch("paths") }
hook_files = hooks.fetch("hooks").map { |hook| hook.fetch("file") }.uniq

override_files = Dir[".fork/overrides/*.yml"].flat_map do |file|
  data = YAML.safe_load(File.read(file), permitted_classes: [], aliases: false)
  Array(data && data["overrides"]).filter_map { |entry| entry["file"] }
end.uniq

generated = lambda do |path|
  path.start_with?(".sqlx/") ||
    path.include?("/generated/") ||
    [".github/workspace-dep-closures.json", "Cargo.lock", "bun.lock"].include?(path)
end

upstream_files = git!("ls-tree", "-r", "--name-only", upstream).lines(chomp: true).to_h { |p| [p, true] }
diff_paths = git!("diff", "--name-only", "#{upstream}..HEAD").lines(chomp: true).reject(&:empty?)

errors = []

# Upstream-provided Skills are immutable mirrors. Fork policy belongs in
# macro-private-maintainer and macro-pre-push-gate only.
upstream_files.keys.grep(%r{\A\.agents/skills/(?:.+)/(?:SKILL|skill)\.md\z}).each do |path|
  next unless File.file?(path)
  local_sha = git!("rev-parse", "HEAD:#{path}").strip
  upstream_sha = git!("rev-parse", "#{upstream}:#{path}").strip
  errors << "upstream Skill drift: #{path}" unless local_sha == upstream_sha
end

unexplained = diff_paths.select do |path|
  next false unless upstream_files[path]
  next false if generated.call(path)
  next false if hook_files.include?(path)
  next false if override_files.include?(path)
  !patterns.any? { |pattern| covered?(pattern, path) }
end

unexplained.each { |path| errors << "unexplained upstream-owned drift: #{path}" }

if errors.empty?
  puts "Core drift gate OK against #{upstream} (#{diff_paths.length} total fork diff paths)"
else
  warn "Core drift gate failed against #{upstream}:"
  errors.each { |error| warn "  - #{error}" }
  warn
  warn "Restore upstream or register the smallest explicit fork ownership."
  exit 1
end
