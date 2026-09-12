#!/usr/bin/env ruby
# frozen_string_literal: true

require "json"
require "optparse"
require "open3"
require "pathname"
require "yaml"

options = { manifest: ".fork/customizations.yml", format: "text" }
OptionParser.new do |parser|
  parser.banner = "Usage: check-upstream-overlap.rb --base REF --head REF [options]"
  parser.on("--base REF", "Base Git reference") { |value| options[:base] = value }
  parser.on("--head REF", "Head Git reference") { |value| options[:head] = value }
  parser.on("--manifest PATH", "Customization manifest") { |value| options[:manifest] = value }
  parser.on("--format FORMAT", %w[text github json], "Output format") { |value| options[:format] = value }
end.parse!

abort "--base and --head are required" unless options[:base] && options[:head]

root = Pathname.new(__dir__).join("../..").cleanpath
Dir.chdir(root)

manifest = YAML.safe_load(File.read(options[:manifest]), permitted_classes: [], aliases: false)
abort "manifest version must be 1" unless manifest.is_a?(Hash) && manifest["version"] == 1

entries = manifest["customizations"]
abort "customizations must be a non-empty array" unless entries.is_a?(Array) && !entries.empty?

allowed_risks = %w[low medium high].freeze
  allowed_tests = %w[auth-rust conventions email-rust email-translation i18n selfhost-config web workflow-lint].freeze
ids = {}
entries.each_with_index do |entry, index|
  prefix = "customizations[#{index}]"
  abort "#{prefix} must be a mapping" unless entry.is_a?(Hash)

  id = entry["id"]
  abort "#{prefix}.id must use uppercase letters, digits, and hyphens" unless id.is_a?(String) && id.match?(/\A[A-Z][A-Z0-9-]*\z/)
  abort "duplicate customization id: #{id}" if ids[id]
  ids[id] = true

  %w[title rationale].each do |key|
    abort "#{id}.#{key} must be a non-empty string" unless entry[key].is_a?(String) && !entry[key].strip.empty?
  end
  abort "#{id}.risk must be low, medium, or high" unless allowed_risks.include?(entry["risk"])

  %w[paths tests].each do |key|
    values = entry[key]
    abort "#{id}.#{key} must be a non-empty string array" unless values.is_a?(Array) && !values.empty? && values.all? { |value| value.is_a?(String) && !value.empty? }
  end
  abort "#{id}.paths may not cover the entire repository" if entry["paths"].any? { |path| ["*", "**", "**/*"].include?(path) }
  unknown_tests = entry["tests"] - allowed_tests
  abort "#{id}.tests contains unknown groups: #{unknown_tests.join(', ')}" unless unknown_tests.empty?
end

stdout, stderr, status = Open3.capture3("git", "diff", "--name-only", "#{options[:base]}...#{options[:head]}")
abort stderr unless status.success?
changed_paths = stdout.lines(chomp: true).reject(&:empty?)

hits = entries.map do |entry|
  matched = changed_paths.select do |path|
    entry["paths"].any? do |pattern|
      recursive_prefix = pattern.end_with?("/**") ? pattern.delete_suffix("/**") : nil
      File.fnmatch?(pattern, path, File::FNM_PATHNAME | File::FNM_EXTGLOB) ||
        (recursive_prefix && (path == recursive_prefix || path.start_with?("#{recursive_prefix}/")))
    end
  end
  entry.merge("matched_paths" => matched) unless matched.empty?
end.compact

tests = hits.flat_map { |entry| entry["tests"] }.uniq.sort
result = {
  "base" => options[:base],
  "head" => options[:head],
  "changed_path_count" => changed_paths.length,
  "overlap_count" => hits.length,
  "test_groups" => tests,
  "overlaps" => hits
}

case options[:format]
when "json"
  puts JSON.pretty_generate(result)
when "github"
  output_file = ENV["GITHUB_OUTPUT"]
  summary_file = ENV["GITHUB_STEP_SUMMARY"]
  abort "GITHUB_OUTPUT and GITHUB_STEP_SUMMARY are required for github format" unless output_file && summary_file

  File.open(output_file, "a") do |file|
    file.puts "overlap_count=#{hits.length}"
    file.puts "test_groups=#{JSON.generate(tests)}"
  end
  File.open(summary_file, "a") do |file|
    file.puts "## Upstream customization overlap"
    file.puts
    file.puts "Compared `#{options[:base]}...#{options[:head]}` across #{changed_paths.length} changed paths."
    file.puts
    if hits.empty?
      file.puts "No registered customization paths overlap this change."
    else
      file.puts "| ID | Risk | Matched paths | Required test groups |"
      file.puts "| --- | --- | ---: | --- |"
      hits.each do |entry|
        tests_text = entry["tests"].map { |test| "`#{test}`" }.join(", ")
        file.puts "| `#{entry['id']}` | #{entry['risk']} | #{entry['matched_paths'].length} | #{tests_text} |"
      end
      file.puts
      file.puts "> An overlap requires semantic review; it does not by itself prove a conflict."
    end
  end
else
  puts "Compared #{options[:base]}...#{options[:head]}: #{changed_paths.length} changed paths"
  if hits.empty?
    puts "No registered customization overlaps."
  else
    hits.each do |entry|
      puts "#{entry['id']} [#{entry['risk']}]: #{entry['matched_paths'].length} path(s); tests=#{entry['tests'].join(',')}"
      entry["matched_paths"].first(10).each { |path| puts "  - #{path}" }
      puts "  - ..." if entry["matched_paths"].length > 10
    end
  end
end
