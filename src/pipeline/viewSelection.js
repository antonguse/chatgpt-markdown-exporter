export function selectAllMessages(conversation) {
  return conversation.messages;
}

export function selectNonSystemMessages(messages) {
  return messages.filter((message) => message.role !== 'system');
}

export function selectTerminalVisibleMessages(messages) {
  return messages.filter((message) => message.terminal_visible !== false);
}
