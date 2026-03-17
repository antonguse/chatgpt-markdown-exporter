export function createDebugSink(textareaElement) {
  return {
    write(message) {
      console.log(message);
      textareaElement.value += `${message}\n`;
      textareaElement.scrollTop = textareaElement.scrollHeight;
    },
    clear() {
      textareaElement.value = "";
    }
  };
}
