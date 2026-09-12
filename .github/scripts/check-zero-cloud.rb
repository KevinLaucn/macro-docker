#!/usr/bin/env ruby
# frozen_string_literal: true

require "optparse"
require "open3"

options = { base: "upstream/main", head: "HEAD" }
OptionParser.new do |parser|
  parser.banner = "Usage: check-zero-cloud.rb [--base REF] [--head REF]"
  parser.on("--base REF", "Base Git ref") { |value| options[:base] = value }
  parser.on("--head REF", "Head Git ref") { |value| options[:head] = value }
end.parse!

# These are the private/self-host build paths. General upstream application
# code is intentionally excluded: upstream may legitimately retain its own
# hosted defaults, while self-host must explicitly route to local services.
protected_paths = [
  "self-host/",
  "docker/",
  "nix/",
  "tooling/just/",
  ".github/workflows/self-host-images.yml",
  "apps/web/src/lib/core/constant/servers.ts",
  "apps/web/src/lib/service-clients/",
]

forbidden_endpoint = %r{https?://[^\s"'`)>]*(?:macro\.com|macroverse\.workers\.dev|workers\.dev|posthog\.com|cloudfront\.net)}i

def protected_path?(path, protected_paths)
  protected_paths.any? { |prefix| path.start_with?(prefix) }
end

def active_line?(line)
  stripped = line.strip
  !stripped.empty? && !stripped.start_with?("#", "//", "*", "<!--")
end

diff, stderr, status = Open3.capture3(
  "git", "diff", "--unified=0", "#{options[:base]}...#{options[:head]}", "--"
)
abort "cannot inspect #{options[:base]}...#{options[:head]}: #{stderr.strip}" unless status.success?

violations = []
current_path = nil
diff.each_line do |line|
  if line.start_with?("diff --git ")
    current_path = line.split(" b/", 2).last&.strip
    next
  end
  next unless current_path && protected_path?(current_path, protected_paths)
  next unless line.start_with?("+") && !line.start_with?("+++")

  content = line.delete_prefix("+")
  next unless active_line?(content)
  next unless content.match?(forbidden_endpoint)
  next if content.match?(/macro\.example\.com/i)

  violations << "#{current_path}: #{content.strip}"
end

env_example = File.read("self-host/.env.example")
required_markers = [
  "ENVIRONMENT=local",
  "OVERRIDE_DOCUMENT_STORAGE_SERVICE_URL=",
  "OVERRIDE_EMAIL_SERVICE_URL=",
  "OVERRIDE_AUTH_SERVICE_URL=",
]
required_markers.each do |marker|
  violations << "self-host/.env.example: missing required marker #{marker}" unless env_example.include?(marker)
end

if violations.empty?
  puts "Zero-cloud gate OK (protected self-host paths have no new official endpoints)"
else
  warn "Zero-cloud gate failed:"
  violations.each { |violation| warn "  - #{violation}" }
  warn "Use an explicit self-host override or local service URL; do not add an implicit Macro cloud fallback."
  exit 1
end
