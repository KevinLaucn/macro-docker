#!/usr/bin/env ruby
# frozen_string_literal: true

require "optparse"
require "open3"
require "yaml"

options = { manifest: ".fork/retirements.yml" }
OptionParser.new do |parser|
  parser.banner = "Usage: check-fork-retirements.rb --upstream REF [--manifest PATH]"
  parser.on("--upstream REF", "Upstream Git ref to inspect") { |value| options[:upstream] = value }
  parser.on("--manifest PATH", "Retirement manifest") { |value| options[:manifest] = value }
end.parse!

abort "--upstream is required" unless options[:upstream]
manifest = YAML.safe_load(File.read(options[:manifest]), permitted_classes: [], aliases: false)
abort "retirement manifest version must be 1" unless manifest.is_a?(Hash) && manifest["version"] == 1
entries = manifest["retirements"]
abort "retirements must be an array" unless entries.is_a?(Array)

errors = []
candidates = []
entries.each do |entry|
  id = entry["id"]
  file = entry["file"]
  old_signature = entry["upstream_old_signature"]
  fix_signature = entry["upstream_fix_signature"]
  unless [id, file, old_signature, fix_signature].all? { |value| value.is_a?(String) && !value.empty? }
    errors << "#{id || "retirement"}: id, file, upstream_old_signature and upstream_fix_signature are required"
    next
  end

  stdout, stderr, status = Open3.capture3("git", "show", "#{options[:upstream]}:#{file}")
  unless status.success?
    errors << "#{id}: cannot read #{options[:upstream]}:#{file}: #{stderr.strip}"
    next
  end

  if stdout.include?(fix_signature)
    pr = entry["upstream_pr"]
    reference = pr.is_a?(String) && !pr.empty? ? " (reference: #{pr})" : ""
    candidates << "#{id}: upstream contains fix signature; review removal of #{file} and its Hook#{reference}"
  elsif !stdout.include?(old_signature)
    errors << "#{id}: upstream contains neither old nor fix signature; manual review required"
  end
end

unless errors.empty?
  warn "Fork retirement gate failed:"
  errors.each { |error| warn "  - #{error}" }
  exit 1
end

if candidates.empty?
  puts "Fork retirement gate OK (no upstream fix candidates)"
else
  warn "Fork retirement candidates detected:"
  candidates.each { |candidate| warn "  - #{candidate}" }
  warn "Do not remove automatically: run the regression test, review behavior, then delete the Fork Hook and manifest entry deliberately."
  exit 1
end
