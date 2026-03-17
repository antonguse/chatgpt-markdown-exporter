export function renderConversationAsMarkdown(conversation) {
  return conversation.messages
    .map((message) => `### ${message.role}\n\n${JSON.stringify(message.parts)}`)
    .join('\n\n');
}
