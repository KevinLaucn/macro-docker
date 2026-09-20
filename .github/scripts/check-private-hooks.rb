#!/usr/bin/env ruby
# frozen_string_literal: true

require "open3"
require "optparse"
require "pathname"
require "yaml"

options = { manifest: ".fork/private-hooks.yml" }
OptionParser.new do |parser|
  parser.banner = "Usage: check-private-hooks.rb [--manifest PATH]"
  parser.on("--manifest PATH", "Private hook manifest") { |value| options[:manifest] = value }
end.parse!

root = Pathname.new(__dir__).join("../..").cleanpath
Dir.chdir(root)

def covered?(pattern, path)
  prefix = pattern.end_with?("/**") ? pattern.delete_suffix("/**") : nil
  File.fnmatch?(pattern, path, File::FNM_PATHNAME | File::FNM_EXTGLOB) ||
    (prefix && (path == prefix || path.start_with?("#{prefix}/")))
end

def git_success?(*args)
  _out, _err, status = Open3.capture3("git", *args)
  status.success?
end

abort "private hook manifest not found: #{options[:manifest]}" unless File.file?(options[:manifest])

manifest = YAML.safe_load(File.read(options[:manifest]), permitted_classes: [], aliases: false)
abort "manifest version must be 1" unless manifest.is_a?(Hash) && manifest["version"] == 1
hooks = manifest["hooks"]
abort "hooks must be an array" unless hooks.is_a?(Array)

customization_manifest = YAML.safe_load(File.read(".fork/customizations.yml"), permitted_classes: [], aliases: false)
customizations = customization_manifest.fetch("customizations")
customizations_by_id = customizations.to_h { |entry| [entry.fetch("id"), entry] }

upstream_manifest = YAML.safe_load(File.read(".fork/upstream.yml"), permitted_classes: [], aliases: false)
upstream_ref = ENV["CHECK_BASE"] || upstream_manifest.fetch("last_merged_upstream_sha")
abort "upstream ref is unavailable: #{upstream_ref}" unless git_success?("rev-parse", "--verify", "#{upstream_ref}^{commit}")

errors = []
ids = {}

hooks.each_with_index do |hook, index|
  prefix = "hooks[#{index}]"
  unless hook.is_a?(Hash)
    errors << "#{prefix} must be a mapping"
    next
  end

  id = hook["id"]
  customization_id = hook["customization"]
  file = hook["file"]
  marker = hook["marker"]
  expected = hook["expected"]
  context = hook["context"] || []

  errors << "#{prefix}.id must be a non-empty string" unless id.is_a?(String) && !id.strip.empty?
  if id.is_a?(String)
    errors << "duplicate hook id: #{id}" if ids[id]
    ids[id] = true
  end
  errors << "#{id || prefix}.customization must be a non-empty string" unless customization_id.is_a?(String) && !customization_id.empty?
  errors << "#{id || prefix}.file must be a non-empty string" unless file.is_a?(String) && !file.strip.empty?
  errors << "#{id || prefix}.marker must be a non-empty string" unless marker.is_a?(String) && !marker.strip.empty?
  errors << "#{id || prefix}.expected must be a non-empty string" unless expected.is_a?(String) && !expected.strip.empty?
  errors << "#{id || prefix}.context must be a string array" unless context.is_a?(Array) && context.all? { |value| value.is_a?(String) }

  next unless file.is_a?(String) && marker.is_a?(String) && expected.is_a?(String)

  owner = customizations_by_id[customization_id]
  if owner.nil?
    errors << "#{id}: unknown customization owner: #{customization_id}"
  else
    watched = owner.fetch("paths").any? { |pattern| covered?(pattern, file) }
    errors << "#{id}: owner #{customization_id} does not watch #{file}" unless watched

    upstream_has_file = git_success?("cat-file", "-e", "#{upstream_ref}:#{file}")
    if upstream_has_file && !Array(owner["owned_paths"]).include?(file)
      errors << "#{id}: upstream-owned hook file is missing from #{customization_id}.owned_paths: #{file}"
    end
  end

  unless File.file?(file)
    errors << "#{id}: file missing: #{file}"
    next
  end

  source = File.read(file)
  marker_count = source.scan(marker).length
  errors << "#{id}: marker must appear exactly once, found #{marker_count}: #{marker}" unless marker_count == 1
  errors << "#{id}: expected snippet missing: #{expected.lines.first&.strip || expected}" unless source.include?(expected)
  context.each { |snippet| errors << "#{id}: context snippet missing: #{snippet}" unless source.include?(snippet) }
end

if errors.empty?
  puts "Private hook gate OK (#{hooks.length} hooks, explicit owners, upstream=#{upstream_ref})"
else
  warn "Private hook gate failed:"
  errors.each { |error| warn "  - #{error}" }
  exit 1
end
