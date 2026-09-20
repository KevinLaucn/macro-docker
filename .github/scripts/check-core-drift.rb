#!/usr/bin/env ruby
# frozen_string_literal: true

require "optparse"
require "open3"
require "pathname"
require "yaml"

options = {
  snapshot: ".fork/remaining-core-diffs.yml",
  write_snapshot: false,
}
OptionParser.new do |parser|
  parser.banner = "Usage: check-core-drift.rb [--upstream REF] [--write-snapshot]"
  parser.on("--upstream REF", "Upstream ref to compare") { |value| options[:upstream] = value }
  parser.on("--snapshot PATH", "Derived drift snapshot") { |value| options[:snapshot] = value }
  parser.on("--write-snapshot", "Rewrite the derived drift snapshot after validation") { options[:write_snapshot] = true }
end.parse!
options[:upstream] ||= ARGV.shift unless ARGV.empty?

root = Pathname.new(__dir__).join("../..").cleanpath
Dir.chdir(root)

def git(*args)
  Open3.capture3("git", *args)
end

def git!(*args)
  out, err, status = git(*args)
  abort "git #{args.join(' ')} failed:\n#{err}" unless status.success?
  out
end

def git_success?(*args)
  _out, _err, status = git(*args)
  status.success?
end

anchor = YAML.safe_load(File.read(".fork/upstream.yml"), permitted_classes: [], aliases: false)
abort ".fork/upstream.yml version must be 1" unless anchor.is_a?(Hash) && anchor["version"] == 1
tracked_upstream = anchor.fetch("last_merged_upstream_sha")
upstream = options[:upstream] || ENV["CHECK_BASE"] || tracked_upstream
resolved_upstream = git!("rev-parse", "#{upstream}^{commit}").strip

customization_manifest = YAML.safe_load(File.read(".fork/customizations.yml"), permitted_classes: [], aliases: false)
customizations = customization_manifest.fetch("customizations")
hooks_manifest = YAML.safe_load(File.read(".fork/private-hooks.yml"), permitted_classes: [], aliases: false)
hooks = hooks_manifest.fetch("hooks")

errors = []

if ENV["FORK_SYNC_STRICT"] == "1"
  errors << "sync target #{resolved_upstream} is not an ancestor of HEAD" unless git_success?("merge-base", "--is-ancestor", resolved_upstream, "HEAD")
  errors << ".fork/upstream.yml still records #{tracked_upstream}, expected #{resolved_upstream}" unless tracked_upstream == resolved_upstream
end

upstream_paths = git!("ls-tree", "-r", "--name-only", resolved_upstream).lines(chomp: true).reject(&:empty?)
head_paths = git!("ls-tree", "-r", "--name-only", "HEAD").lines(chomp: true).reject(&:empty?)
upstream_set = upstream_paths.to_h { |path| [path, true] }
head_set = head_paths.to_h { |path| [path, true] }

# Every upstream-provided Skill directory is an immutable mirror, including
# metadata, references, scripts, and symlinks—not only SKILL.md.
upstream_skill_paths = upstream_paths.select { |path| path.start_with?(".agents/skills/") }
upstream_skill_roots = upstream_skill_paths.map { |path| path.split("/").first(3).join("/") }.uniq
head_official_skill_paths = head_paths.select do |path|
  upstream_skill_roots.any? { |root_path| path == root_path || path.start_with?("#{root_path}/") }
end

(upstream_skill_paths - head_official_skill_paths).each { |path| errors << "missing upstream Skill file: #{path}" }
(head_official_skill_paths - upstream_skill_paths).each { |path| errors << "extra file inside upstream Skill: #{path}" }
(upstream_skill_paths & head_official_skill_paths).each do |path|
  upstream_sha = git!("rev-parse", "#{resolved_upstream}:#{path}").strip
  head_sha = git!("rev-parse", "HEAD:#{path}").strip
  errors << "upstream Skill drift: #{path}" unless upstream_sha == head_sha
end

diff_paths = git!("diff", "--name-only", "#{resolved_upstream}..HEAD").lines(chomp: true).reject(&:empty?)
upstream_owned_diff = diff_paths.select { |path| upstream_set[path] }

deleted_upstream = upstream_owned_diff.reject { |path| head_set[path] }
deleted_upstream.each { |path| errors << "upstream-owned file deleted from fork: #{path}" }

owners_by_file = Hash.new { |hash, key| hash[key] = [] }
customizations.each do |entry|
  Array(entry["owned_paths"]).each do |path|
    owners_by_file[path] << entry.fetch("id")
    errors << "#{entry['id']}.owned_paths references file absent from upstream: #{path}" unless upstream_set[path]
    errors << "#{entry['id']}.owned_paths is stale; file no longer differs from upstream: #{path}" unless upstream_owned_diff.include?(path)
  end
end
owners_by_file.each_value(&:sort!)

hook_ids_by_file = Hash.new { |hash, key| hash[key] = [] }
hooks.each { |hook| hook_ids_by_file[hook.fetch("file")] << hook.fetch("id") }
hook_ids_by_file.each_value(&:sort!)

override_files = Dir[".fork/overrides/*.yml"].flat_map do |file|
  data = YAML.safe_load(File.read(file), permitted_classes: [], aliases: false)
  Array(data && data["overrides"]).filter_map { |entry| entry["file"] }
end.uniq.sort

unexplained = upstream_owned_diff.reject do |path|
  !owners_by_file[path].empty? || override_files.include?(path)
end
unexplained.each { |path| errors << "unexplained upstream-owned drift: #{path}" }

snapshot_entries = upstream_owned_diff.sort.map do |path|
  entry = {
    "file" => path,
    "owners" => owners_by_file[path],
    "hooks" => hook_ids_by_file[path],
    "override" => override_files.include?(path),
  }
  entry
end

if errors.empty? && options[:write_snapshot]
  snapshot = {
    "version" => 2,
    "upstream_sha" => resolved_upstream,
    "diffs" => snapshot_entries,
  }
  File.write(options[:snapshot], YAML.dump(snapshot))
  puts "Wrote #{options[:snapshot]} (#{snapshot_entries.length} upstream-owned diff paths)"
  exit 0
end

if File.file?(options[:snapshot])
  snapshot = YAML.safe_load(File.read(options[:snapshot]), permitted_classes: [], aliases: false)
  if !snapshot.is_a?(Hash) || snapshot["version"] != 2
    errors << "#{options[:snapshot]} must be regenerated as version 2"
  else
    errors << "#{options[:snapshot]} upstream_sha=#{snapshot['upstream_sha']} expected #{resolved_upstream}" unless snapshot["upstream_sha"] == resolved_upstream
    actual = snapshot_entries.to_h { |entry| [entry["file"], entry] }
    recorded = Array(snapshot["diffs"]).to_h { |entry| [entry["file"], entry] }
    (actual.keys - recorded.keys).sort.each { |path| errors << "drift snapshot missing: #{path}" }
    (recorded.keys - actual.keys).sort.each { |path| errors << "stale drift snapshot entry: #{path}" }
    (actual.keys & recorded.keys).sort.each do |path|
      %w[owners hooks override].each do |key|
        expected = actual[path][key]
        found = recorded[path][key]
        errors << "drift snapshot mismatch for #{path} #{key}: #{found.inspect} != #{expected.inspect}" unless found == expected
      end
    end
  end
else
  errors << "drift snapshot missing: #{options[:snapshot]}"
end

if errors.empty?
  puts "Core drift gate OK against #{resolved_upstream} (#{upstream_owned_diff.length} upstream-owned diff paths; official Skills 0 diff)"
else
  warn "Core drift gate failed against #{resolved_upstream}:"
  errors.each { |error| warn "  - #{error}" }
  warn
  warn "Restore upstream, register an exact owned_path/override, or deliberately regenerate the v2 snapshot after review."
  exit 1
end
