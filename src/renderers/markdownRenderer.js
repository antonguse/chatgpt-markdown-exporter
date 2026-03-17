function normalizeRoleHeading(role) {
  if (role === 'user') return 'User';
  if (role === 'assistant') return 'Assistant';
  if (!role) return 'Message';
  return role.charAt(0).toUpperCase() + role.slice(1);
}

function renderMessageText(parts) {
  if (!Array.isArray(parts) || parts.length === 0) return '';
  return parts
    .map((part) => {
      if (typeof part === 'string') return part;
      return JSON.stringify(part);
    })
    .join('\n\n')
    .trim();
}

export function renderConversationAsMarkdown(conversation, options = {}) {
  const blocks = [];

  if (options.title) {
    blocks.push(`# ${options.title}`);
  }

  if (options.sourceUrl) {
    blocks.push(`Source: ${options.sourceUrl}`);
  }

  conversation.messages.forEach((message) => {
    blocks.push(`## ${normalizeRoleHeading(message.role)}`);
    blocks.push(renderMessageText(message.parts));
  });

  return blocks.join('\n\n').trim();
}
