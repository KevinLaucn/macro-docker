#!/usr/bin/env ruby
# frozen_string_literal: true

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

abort "private hook manifest not found: #{options[:manifest]}" unless File.file?(options[:manifest])

manifest = YAML.safe_load(File.read(options[:manifest]), permitted_classes: [], aliases: false)
abort "manifest version must be 1" unless manifest.is_a?(Hash) && manifest["version"] == 1

hooks = manifest["hooks"]
abort "hooks must be an array" unless hooks.is_a?(Array)

errors = []
ids = {}

hooks.each_with_index do |hook, index|
  prefix = "hooks[#{index}]"
  unless hook.is_a?(Hash)
    errors << "#{prefix} must be a mapping"
    next
  end

  id = hook["id"]
  file = hook["file"]
  marker = hook["marker"]
  expected = hook["expected"]
  context = hook["context"] || []

  errors << "#{prefix}.id must be a non-empty string" unless id.is_a?(String) && !id.strip.empty?
  if id.is_a?(String)
    errors << "duplicate hook id: #{id}" if ids[id]
    ids[id] = true
  end
  errors << "#{id || prefix}.file must be a non-empty string" unless file.is_a?(String) && !file.strip.empty?
  errors << "#{id || prefix}.marker must be a non-empty string" unless marker.is_a?(String) && !marker.strip.empty?
  errors << "#{id || prefix}.expected must be a non-empty string" unless expected.is_a?(String) && !expected.strip.empty?
  errors << "#{id || prefix}.context must be a string array" unless context.is_a?(Array) && context.all? { |value| value.is_a?(String) }

  next unless file.is_a?(String) && marker.is_a?(String) && expected.is_a?(String)

  unless File.file?(file)
    errors << "#{id}: file missing: #{file}"
    next
  end

  content = File.read(file)
  marker_count = content.scan(marker).length
  errors << "#{id}: marker must appear exactly once, found #{marker_count}: #{marker}" unless marker_count == 1
  errors << "#{id}: expected snippet missing: #{expected.lines.first&.strip || expected}" unless content.include?(expected)

  context.each do |snippet|
    errors << "#{id}: context snippet missing: #{snippet}" unless content.include?(snippet)
  end
end

if errors.empty?
  puts "Private hook gate OK (#{hooks.length} hook#{hooks.length == 1 ? "" : "s"})"
else
  warn "Private hook gate failed:"
  errors.each { |error| warn "  - #{error}" }
  exit 1
end
