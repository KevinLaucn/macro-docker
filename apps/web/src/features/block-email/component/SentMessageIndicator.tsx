import { cn } from '@ui';
import { type JSX, Show } from 'solid-js';

/**
 * 邮件会话与外发状态标识组件 (SentMessageIndicator)
 *
 * 【架构设计与方案备忘】：
 * - 方案 A（当前优先）：基于状态/时间戳即时派生（Derived State）。
 *   依赖核心数据维度（如 is_sent/is_draft 以及 latest_inbound/latest_outbound 时间戳对比）。
 *   具备零 DB 写入开销、零延迟长连接响应、不污染云端标签的优点。
 * - 方案 B（备选演进）：后端事件流实体驱动（PubSub EmailTopicEvent 写入真实标签）。
 *   若未来在多端同步、离线归档邮件复杂的边界流转中发现方案 A 存在状态漂移，
 *   可考虑切换至方案 B 或通过持久化状态列兜底。
 */

export interface SentMessageIndicatorProps {
  isSent?: boolean;
  isExpanded?: boolean;
}

export function SentMessageIndicator(
  props: SentMessageIndicatorProps
): JSX.Element {
  return (
    <Show when={props.isSent}>
      <div
        class={cn(
          'absolute -inset-y-px -left-px w-1 rounded-l-lg transition-colors duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none bg-accent/70'
        )}
        aria-hidden="true"
      />
    </Show>
  );
}
