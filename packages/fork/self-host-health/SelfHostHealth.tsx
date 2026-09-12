import {
  SettingsCard,
  SettingsPage,
  SettingsRow,
  SettingsSection,
} from '@app/features/settings/primitives';
import { t } from '@macro/i18n';
import ArrowsClockwiseIcon from '@phosphor/arrows-clockwise.svg';
import CheckCircleIcon from '@phosphor/check-circle.svg';
import ShieldCheckIcon from '@phosphor/shield-check.svg';
import SpinnerIcon from '@phosphor/spinner-gap.svg';
import WarningCircleIcon from '@phosphor/warning-circle.svg';
import XCircleIcon from '@phosphor/x-circle.svg';
import { Button, cn } from '@ui';
import { createMemo, createSignal, For, Show } from 'solid-js';
import { useSelfHostHealthQuery } from './queries';
import type { CheckCategory, HealthCheckItem, HealthStatus } from './types';

function StatusBadge(props: { status: HealthStatus }) {
  const config = () => {
    switch (props.status) {
      case 'ok':
        return {
          label: t('正常'),
          classes: 'text-success bg-success/10 border-success/20',
          icon: CheckCircleIcon,
        };
      case 'warning':
        return {
          label: t('警告'),
          classes: 'text-warning bg-warning/10 border-warning/20',
          icon: WarningCircleIcon,
        };
      case 'critical':
        return {
          label: t('故障'),
          classes: 'text-failure bg-failure/10 border-failure/20',
          icon: XCircleIcon,
        };
      default:
        return {
          label: t('未启用'),
          classes: 'text-ink-muted bg-surface border-edge-muted',
          icon: ShieldCheckIcon,
        };
    }
  };

  return (
    <span
      class={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border shrink-0 select-none',
        config().classes
      )}
    >
      {/* Phosphor SVGs style via standard classes */}
      <span class="size-3.5 shrink-0 flex items-center justify-center [&_svg]:size-3.5">
        {(() => {
          const Icon = config().icon;
          return <Icon />;
        })()}
      </span>
      <span>{config().label}</span>
    </span>
  );
}

function CategoryLabel(props: { category: CheckCategory }) {
  const label = () => {
    switch (props.category) {
      case 'auth':
        return t('认证中心');
      case 'database':
        return t('核心数据库');
      case 'storage':
        return t('对象存储');
      case 'queues':
        return t('消息队列');
      case 'gmail':
        return t('Gmail 同步');
      case 'read_receipts':
        return t('打开追踪');
      case 'dss':
        return t('文档存储');
      default:
        return t('核心服务');
    }
  };

  return (
    <span class="text-[11px] font-medium tracking-wide uppercase px-1.5 py-0.5 rounded bg-ink/[0.04] text-ink-muted">
      {label()}
    </span>
  );
}

type DetailField = {
  label: string;
  value: string;
};

const QUEUE_LABELS: Record<string, string> = {
  gmail_inbox_sync: 'Gmail 收件箱同步',
  gmail_inbox_sync_retry: 'Gmail 收件箱重试',
  gmail_ops: 'Gmail 操作队列',
  gmail_ops_retry: 'Gmail 操作重试',
  email_link_manager: '邮箱连接管理',
  email_backfill: '邮件历史回填',
};

function displayDetailValue(value: string) {
  return value
    .replaceAll('Some("', '')
    .replaceAll('")', '')
    .replaceAll('None', '未设置')
    .replaceAll('null', '未设置');
}

function parseKeyValueFields(value: string): DetailField[] {
  return value.split(/,\s*/).flatMap((part) => {
    const separator = part.indexOf('=');
    if (separator < 1) return [];
    return [
      {
        label: part.slice(0, separator).trim(),
        value: displayDetailValue(part.slice(separator + 1).trim()),
      },
    ];
  });
}

function parseQueueDetails(details: string) {
  const rows = new Map<
    string,
    { name: string; fields: DetailField[]; dlqFields?: DetailField[] }
  >();

  for (const line of details.split('\n')) {
    const match = line.trim().match(/^([^:]+):\s*(.*)$/);
    if (!match) continue;
    const [, rawName, rawValue] = match;
    const baseName = rawName.replace(/_dlq(?:\([^)]*\))?$/, '');
    const row = rows.get(baseName) ?? {
      name: QUEUE_LABELS[baseName] ?? baseName,
      fields: [],
    };

    if (rawName.endsWith('_dlq') || rawName.includes('_dlq(')) {
      row.dlqFields = parseKeyValueFields(rawValue);
    } else if (!rawValue.startsWith('DLQ 未配置')) {
      row.fields = parseKeyValueFields(rawValue);
    }
    rows.set(baseName, row);
  }

  return [...rows.values()];
}

function parseGmailDetails(details: string) {
  return details.split('\n').flatMap((line) => {
    const separator = line.indexOf(':');
    if (separator < 1) return [];
    const email = line.slice(0, separator).trim();
    const fields = line.slice(separator + 1);
    const official = fields.match(
      /official messages=(\d+), threads=(\d+), history_id=([^;]+);/
    );
    const local = fields.match(
      /local messages=(\d+), threads=(\d+), history_id=([^;]+);/
    );
    const backfill = fields.match(/backfill status=([^,]+),\s*([^;]+);/);
    const watch = fields.match(/(watch_history_id|watch_error)=([^;]+)/);
    if (!official || !local) return [];
    return [
      {
        email,
        fields: {
          officialMessages: official[1],
          officialThreads: official[2],
          officialHistory: displayDetailValue(official[3]),
          localMessages: local[1],
          localThreads: local[2],
          localHistory: displayDetailValue(local[3]),
          backfill: backfill
            ? `${displayDetailValue(backfill[1])} · ${backfill[2]}`
            : '—',
          watch: watch ? displayDetailValue(watch[2]) : '—',
        },
      },
    ];
  });
}

function DetailTable(props: {
  headers: string[];
  rows: string[][];
  note?: string;
}) {
  return (
    <div class="flex flex-col gap-2">
      <div class="overflow-x-auto rounded-lg border border-edge-muted/60 bg-surface">
        <table class="w-full min-w-max border-collapse text-xs">
          <thead class="bg-hover text-left text-ink-muted">
            <tr>
              <For each={props.headers}>
                {(header) => (
                  <th class="whitespace-nowrap border-b border-edge-muted/60 px-3 py-2 font-medium">
                    {t(header)}
                  </th>
                )}
              </For>
            </tr>
          </thead>
          <tbody>
            <For each={props.rows}>
              {(row) => (
                <tr class="border-b border-edge-muted/40 last:border-b-0">
                  <For each={row}>
                    {(cell, index) => (
                      <td
                        class={cn(
                          'whitespace-nowrap px-3 py-2 text-ink-muted',
                          index() === 0 && 'font-medium text-ink'
                        )}
                      >
                        {cell}
                      </td>
                    )}
                  </For>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>
      <Show when={props.note}>
        <p class="text-xs leading-relaxed text-ink-subtle">{props.note}</p>
      </Show>
    </div>
  );
}

function DiagnosticDetails(props: { item: HealthCheckItem }) {
  const details = () => props.item.details ?? '';

  if (props.item.id === 'sqs_queue_backlog') {
    const rows = parseQueueDetails(details());
    if (rows.length > 0) {
      const hasDlq = rows.some((row) => row.dlqFields);
      return (
        <DetailTable
          headers={[
            '队列',
            '可见',
            '延迟',
            '处理中',
            '总数',
            ...(hasDlq ? ['DLQ 状态'] : []),
          ]}
          rows={rows.map((row) => [
            ...[
              row.name,
              row.fields.find((field) => field.label === 'visible')?.value ??
                '—',
              row.fields.find((field) => field.label === 'delayed')?.value ??
                '—',
              row.fields.find((field) => field.label === 'in_flight')?.value ??
                '—',
              row.fields.find((field) => field.label === 'total')?.value ?? '—',
            ],
            ...(hasDlq
              ? [
                  row.dlqFields
                    ? `可见 ${row.dlqFields.find((field) => field.label === 'visible')?.value ?? '0'} · 延迟 ${row.dlqFields.find((field) => field.label === 'delayed')?.value ?? '0'} · 处理中 ${row.dlqFields.find((field) => field.label === 'in_flight')?.value ?? '0'} · 总数 ${row.dlqFields.find((field) => field.label === 'total')?.value ?? '0'}`
                    : '—',
                ]
              : []),
          ])}
        />
      );
    }
  }

  if (props.item.id === 'gmail_official_sync') {
    const rows = parseGmailDetails(details());
    if (rows.length > 0) {
      return (
        <DetailTable
          headers={[
            '邮箱',
            '官方邮件',
            '本地邮件',
            '官方线程',
            '本地线程',
            '官方 History ID',
            '本地 History ID',
            '回填',
            'Watch',
          ]}
          rows={rows.map((row) => [
            row.email,
            row.fields.officialMessages,
            row.fields.localMessages,
            row.fields.officialThreads,
            row.fields.localThreads,
            row.fields.officialHistory,
            row.fields.localHistory,
            row.fields.backfill,
            row.fields.watch,
          ])}
        />
      );
    }
  }

  return (
    <p class="whitespace-pre-wrap break-all rounded-lg border border-edge-muted/40 bg-surface p-3 font-mono text-xs text-ink-muted">
      {details()}
    </p>
  );
}

function HealthItemRow(props: { item: HealthCheckItem }) {
  const [expanded, setExpanded] = createSignal(false);
  const hasExtra = () =>
    Boolean(props.item.details || props.item.remediation_hint);

  return (
    <div class="flex flex-col">
      <SettingsRow
        label={
          <div class="flex items-center gap-2">
            <span class="font-medium text-sm text-ink">{props.item.name}</span>
            <CategoryLabel category={props.item.category} />
            <Show when={props.item.duration_ms > 0}>
              <span class="text-[11px] text-ink-subtle">
                {props.item.duration_ms}ms
              </span>
            </Show>
          </div>
        }
        description={
          <div class="flex flex-col gap-1 mt-0.5">
            <span class="text-xs text-ink-muted leading-relaxed">
              {props.item.message}
            </span>
          </div>
        }
      >
        <div class="flex items-center gap-2.5">
          <StatusBadge status={props.item.status} />
          <Show when={hasExtra()}>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => setExpanded(!expanded())}
              class="text-xs text-ink-muted hover:text-ink"
            >
              {expanded() ? t('收起') : t('详情')}
            </Button>
          </Show>
        </div>
      </SettingsRow>

      <Show when={expanded() && hasExtra()}>
        <div class="px-6 py-3 bg-surface-0 border-t border-ink/[0.04] flex flex-col gap-2 text-xs">
          <Show when={props.item.details}>
            <div class="flex flex-col gap-0.5">
              <span class="font-medium text-ink-subtle">{t('诊断细节')}</span>
              <DiagnosticDetails item={props.item} />
            </div>
          </Show>
          <Show when={props.item.remediation_hint}>
            <div class="flex flex-col gap-0.5">
              <span class="font-medium text-accent">{t('修复建议')}</span>
              <p class="text-ink-muted leading-relaxed">
                {props.item.remediation_hint}
              </p>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
}

export function SelfHostHealth() {
  const query = useSelfHostHealthQuery();

  const isFetching = () => query.isFetching;
  const report = () => (query.isSuccess ? query.data : undefined);

  const formattedLastChecked = createMemo(() => {
    const r = report();
    if (!r?.last_checked_at) return undefined;
    try {
      const date = new Date(r.last_checked_at);
      return date.toLocaleTimeString();
    } catch {
      return r.last_checked_at;
    }
  });

  const formattedFailureSince = createMemo(() => {
    const r = report();
    if (!r?.failure_since) return undefined;
    try {
      const date = new Date(r.failure_since);
      return date.toLocaleTimeString();
    } catch {
      return r.failure_since;
    }
  });

  return (
    <SettingsPage
      title={t('健康检查')}
      description={t(
        '自托管生产环境服务健康度与核心业务契约实时诊断（仅 super_admin 可见）。'
      )}
      actions={
        <Button
          variant="outline"
          size="sm"
          disabled={isFetching()}
          onClick={() => query.refetch()}
          class="flex items-center gap-1.5"
        >
          <span
            class={cn(
              'size-3.5 shrink-0 flex items-center justify-center [&_svg]:size-3.5',
              isFetching() && 'animate-spin'
            )}
          >
            {isFetching() ? <SpinnerIcon /> : <ArrowsClockwiseIcon />}
          </span>
          <span>{isFetching() ? t('检查中...') : t('重新检查')}</span>
        </Button>
      }
    >
      {/* Top Overview Card */}
      <SettingsSection title={t('总体运行状态')}>
        <SettingsCard>
          <SettingsRow
            label={t('系统健康级别')}
            description={
              report()?.is_production
                ? t('当前运行于自托管生产环境')
                : t('非生产环境（开发/测试栈模式）')
            }
          >
            <Show
              when={report()}
              fallback={
                <span class="text-xs text-ink-muted flex items-center gap-1.5">
                  <span class="size-3 animate-spin inline-flex items-center justify-center [&_svg]:size-3">
                    <SpinnerIcon />
                  </span>
                  {t('正在连接探针服务...')}
                </span>
              }
            >
              {(r) => <StatusBadge status={r().overall_status} />}
            </Show>
          </SettingsRow>

          <Show when={report()}>
            {(r) => (
              <>
                <SettingsRow
                  label={t('单次诊断总耗时')}
                  description={t('所有探针并行完成的实际耗时')}
                >
                  <span class="text-xs font-mono text-ink-muted">
                    {r().duration_ms} ms
                  </span>
                </SettingsRow>
                <Show when={formattedLastChecked()}>
                  {(time) => (
                    <SettingsRow
                      label={t('最近检查时间')}
                      description={t('后台每 2 分钟自动静默轮询')}
                    >
                      <span class="text-xs font-mono text-ink-muted">
                        {time()}
                      </span>
                    </SettingsRow>
                  )}
                </Show>
                <Show when={r().overall_status === 'critical'}>
                  <SettingsRow
                    label={t('连续失败次数')}
                    description={
                      formattedFailureSince()
                        ? t('首次失败时间: {{time}}', {
                            time: formattedFailureSince(),
                          })
                        : t('当前存在 critical 故障')
                    }
                  >
                    <span class="text-xs font-mono text-failure">
                      {r().consecutive_failures}
                    </span>
                  </SettingsRow>
                </Show>
              </>
            )}
          </Show>
        </SettingsCard>
      </SettingsSection>

      {/* Check Items List */}
      <SettingsSection
        title={t('业务契约与微服务探针')}
        description={t('覆盖身份源、数据库外键一致性、Gmail、像素追踪与 DSS')}
      >
        <SettingsCard>
          <Show
            when={report()?.checks && report()!.checks.length > 0}
            fallback={
              <div class="p-8 text-center text-sm text-ink-muted flex flex-col items-center gap-2">
                <Show
                  when={isFetching()}
                  fallback={<span>{t('暂无探针数据')}</span>}
                >
                  <span class="size-4 animate-spin inline-flex items-center justify-center [&_svg]:size-4">
                    <SpinnerIcon />
                  </span>
                  <span>{t('正在执行业务探针诊断，请稍候...')}</span>
                </Show>
              </div>
            }
          >
            <For each={report()?.checks}>
              {(check) => <HealthItemRow item={check} />}
            </For>
          </Show>
        </SettingsCard>
      </SettingsSection>
    </SettingsPage>
  );
}
