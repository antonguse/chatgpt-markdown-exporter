import { extractPartsPreview, toPartsArray } from '../providers/chatgpt/extractors/conversationExtractor.js';

export function renderConversationAsDebugText(context) {
  const lines = [...(context.prelude || [])];
  const { debug, conversation } = context;

  lines.push(`payload shape classification: ${debug.payloadShape}`);
  lines.push(`raw candidates found: ${debug.rawCandidateCount}`);
  lines.push(`valid messages found: ${debug.validMessageCount}`);
  lines.push(`exported non-system messages: ${conversation.messages.length}`);

  if (debug.payloadShape === 'full-thread-node-map') {
    debug.wrapperDerivedVisibleRoleNodes.slice(0, 20).forEach((item, index) => {
      const node = item.wrapperNode;
      const createTime = typeof node?.message?.create_time === 'number' ? node.message.create_time : '(none)';
      lines.push(`Wrapper-visible ${index + 1}: wrapper_node_id=${node?.id || '(none)'}, role=${item.role}, parent_wrapper_id=${node?.parentId || '(none)'}, create_time=${createTime}`);
    });

    debug.suppressionDecisions.forEach((item) => {
      const node = item.wrapperNode;
      lines.push(`Suppressed: wrapper_node_id=${node?.id || '(none)'}, role=${node?.message?.author?.role || '(none)'}, segment_index=${item.segmentIndex}, nearest_kept_descendant_wrapper_node_id=${item.keptDescendantWrapperId || '(none)'}, reason=suppressed_intermediate_variant`);
    });

    debug.terminalVisibleSelections.slice(0, 15).forEach((item, index) => {
      const node = item.wrapperNode;
      lines.push(`Visible-role with flags ${index + 1}: wrapper_node_id=${node?.id || '(none)'}, role=${node?.message?.author?.role || '(none)'}, parent_wrapper_id=${node?.parentId || '(none)'}, terminal_visible=${item.terminalVisible}`);
    });

    debug.terminalVisibleSelections.filter((item) => item.terminalVisible).slice(0, 10).forEach((item, index) => {
      const node = item.wrapperNode;
      lines.push(`Terminal-visible kept ${index + 1}: wrapper_node_id=${node?.id || '(none)'}, role=${node?.message?.author?.role || '(none)'}, parent_wrapper_id=${node?.parentId || '(none)'}, terminal_visible=true`);
    });

    debug.orderedWrapperNodes.slice(0, 15).forEach((node, index) => {
      const role = node?.message?.author?.role || '(none)';
      const messageId = node?.message?.id || '(none)';
      const createTime = typeof node?.message?.create_time === 'number' ? node.message.create_time : '(none)';
      lines.push(`Ordered wrapper ${index + 1}: wrapper_node_id=${node?.id || '(none)'}, parent_wrapper_id=${node?.parentId || '(none)'}, role=${role}, message_id=${messageId}, create_time=${createTime}`);
    });
  }

  debug.exportedMessages.slice(0, 10).forEach((entry, index) => {
    const message = entry.message;
    const parts = toPartsArray(message?.content?.parts);
    const firstPartPreview = extractPartsPreview(parts, 80) || '(no-text-part)';
    lines.push(`Message ${index + 1}: root_index=${entry.rootIndex}, id=${message.id}, role=${message?.author?.role}, create_time=${message.create_time}, parts_is_array=${Array.isArray(parts)}, parts_len=${parts.length}, first_part=${firstPartPreview}`);
  });

  if (debug.payloadShape === 'full-thread-node-map') {
    debug.exportedMessages.slice(0, 15).forEach((entry, index) => {
      const message = entry.message;
      const firstPartPreview = extractPartsPreview(toPartsArray(message?.content?.parts), 60) || '(no-text-part)';
      lines.push(`Exported ${index + 1}: role=${message?.author?.role}, message_id=${message.id}, create_time=${message.create_time}, first_part=${firstPartPreview}`);
    });
  }

  lines.push('Final message list:');
  debug.exportedMessages.forEach((entry, index) => {
    const message = entry.message;
    lines.push(`#${index + 1} id=${message.id} | role=${message?.author?.role} | create_time=${message.create_time} | parts=${JSON.stringify(toPartsArray(message?.content?.parts))}`);
  });

  return lines.join('\n');
}
