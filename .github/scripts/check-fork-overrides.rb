#!/usr/bin/env ruby
# frozen_string_literal: true

require "optparse"
require "pathname"
require "yaml"

options = { directory: ".fork/overrides", apply: false }
OptionParser.new do |parser|
  parser.banner = "Usage: check-fork-overrides.rb [--check|--apply] [--directory PATH]"
  parser.on("--check", "Validate without changing files") { options[:apply] = false }
  parser.on("--apply", "Apply validated overrides") { options[:apply] = true }
  parser.on("--directory PATH", "Override directory") { |value| options[:directory] = value }
end.parse!

root = Pathname.new(__dir__).join("../..").cleanpath
Dir.chdir(root)
files = Dir[File.join(options[:directory], "*.yml")].sort
errors = []
ids = {}

files.each do |path|
  manifest = YAML.safe_load(File.read(path), permitted_classes: [], aliases: false)
  unless manifest.is_a?(Hash) && manifest["version"] == 1 && manifest["overrides"].is_a?(Array)
    errors << "#{path}: version must be 1 and overrides must be an array"
    next
  end

  manifest["overrides"].each_with_index do |override, index|
    prefix = "#{path}:overrides[#{index}]"
    unless override.is_a?(Hash)
      errors << "#{prefix} must be a mapping"
      next
    end
    id, target, search, replace, expected = %w[id file search replace expected_count].map { |key| override[key] }
    errors << "#{prefix}.id must be unique" unless id.is_a?(String) && !id.strip.empty? && !ids.key?(id)
    ids[id] = true if id.is_a?(String)
    errors << "#{prefix}.file must be a non-empty string" unless target.is_a?(String) && !target.empty?
    errors << "#{prefix}.search must be a non-empty string" unless search.is_a?(String) && !search.empty?
    errors << "#{prefix}.replace must be a string" unless replace.is_a?(String)
    errors << "#{prefix}.expected_count must be a positive integer" unless expected.is_a?(Integer) && expected.positive?
    next unless target.is_a?(String) && search.is_a?(String) && replace.is_a?(String) && expected.is_a?(Integer)
    unless File.file?(target)
      errors << "#{prefix}: target file missing: #{target}"
      next
    end

    content = File.read(target)
    search_count = content.scan(search).length
    replace_count = content.scan(replace).length
    if search_count == expected && replace_count.zero?
      next unless options[:apply]
      File.write(target, content.gsub(search, replace))
    elsif search_count.zero? && replace_count == expected
      next
    else
      errors << "#{prefix}: expected #{expected} source matches or applied replacement, found source=#{search_count}, replacement=#{replace_count}"
    end
  end
end

if errors.empty?
  puts "Fork override gate OK (#{files.length} manifest#{files.length == 1 ? "" : "s"})"
else
  warn "Fork override gate failed:"
  errors.each { |error| warn "  - #{error}" }
  exit 1
end
