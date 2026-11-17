#!/usr/bin/env ruby
# frozen_string_literal: true

require "json"
require "open3"
require "pathname"

root = Pathname.new(__dir__).join("../..").cleanpath
Dir.chdir(root)

puts "Checking Fork i18n coverage and gate..."

# 1. Run official i18n-status
web_dir = root.join("apps/web")
out, err, status = Open3.capture3("bun", "scripts/i18n-status.ts", "--json", chdir: web_dir.to_s)
unless status.success?
  warn "Error running bun scripts/i18n-status.ts --json:"
  warn err
  warn out
  exit 1
end

data = JSON.parse(out)

target_locales = %w[zh-Hans zh-Hant]
failures = []

target_locales.each do |loc|
  entry = data.find { |d| d["language"] == loc }
  unless entry
    failures << "Locale #{loc} not found in i18n status report"
    next
  end

  missing = entry["missing"] || []
  stale = entry["stale"] || []
  mismatches = entry["placeholderMismatch"] || []

  if missing.any?
    failures << "#{loc} has #{missing.length} missing translation keys: #{missing.map { |m| m['key'] }.first(5).join(', ')}"
  end
  if stale.any?
    failures << "#{loc} has #{stale.length} stale translation keys: #{stale.map { |s| s['key'] }.first(5).join(', ')}"
  end
  if mismatches.any?
    failures << "#{loc} has #{mismatches.length} placeholder mismatches: #{mismatches.map { |m| m['key'] }.first(5).join(', ')}"
  end
end

if failures.any?
  warn "Fork i18n Gate FAILED:"
  failures.each { |f| warn "  - #{f}" }
  exit 1
end

puts "Fork i18n gate OK (zh-Hans and zh-Hant: 0 missing, 0 stale, 0 placeholder mismatches)"
