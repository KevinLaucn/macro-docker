#!/usr/bin/env ruby
# frozen_string_literal: true

require "optparse"

options = { base: "upstream/main", head: "HEAD" }
OptionParser.new do |parser|
  parser.banner = "Usage: check-telemetry-privacy.rb [--base REF] [--head REF]"
  parser.on("--base REF", "Base Git ref") { |value| options[:base] = value }
  parser.on("--head REF", "Head Git ref") { |value| options[:head] = value }
end.parse!

errors = []
analytics = File.read("apps/web/src/lib/analytics/analytics.ts")
browser = File.read("apps/web/src/observability/browser.ts")
proxy = File.read("services/analytics-proxy/src/index.ts")
wrangler = File.read("services/analytics-proxy/wrangler.jsonc")
self_host_env = File.read("self-host/.env.example")

errors << "PostHog must require an explicit API key" unless analytics.include?("if (!key) return;")
errors << "browser OTLP must be opt-in or explicitly configured" unless browser.include?("VITE_OTEL_EXPORTER_URL")
errors << "analytics proxy must read POSTHOG_HOST from runtime configuration" unless proxy.include?("c.env.POSTHOG_HOST")
errors << "analytics proxy must reject an unset PostHog host" unless proxy.include?("PostHog is not configured")
local_block = wrangler.split('"local":', 2)[1].to_s.split('"dev":', 2)[0]
errors << "self-host local analytics proxy must not define an implicit PostHog host" if local_block.include?("POSTHOG_HOST")

%w[VITE_POSTHOG_API_KEY VITE_POSTHOG_HOST VITE_OTEL_EXPORTER_URL].each do |marker|
  errors << "self-host/.env.example must not enable #{marker} by default" if self_host_env.match?(/^#{Regexp.escape(marker)}=/)
end

# This gate is about Macro-owned collection endpoints, not all external
# networks. User-configured Google/Gmail, GitHub, AI providers, SMTP, LiveKit,
# PostHog, or OTLP collectors remain valid when explicitly configured.
if proxy.match?(%r{https?://[^\s"']*macro\.com}i)
  errors << "analytics proxy must not hardcode a Macro cloud endpoint"
end

if errors.empty?
  puts "Telemetry privacy gate OK (collection is opt-in and self-host has no implicit Macro endpoint)"
else
  warn "Telemetry privacy gate failed:"
  errors.each { |error| warn "  - #{error}" }
  exit 1
end
