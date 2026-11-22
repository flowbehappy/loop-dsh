// Resolve the UI suite without depending on shell glob expansion on Windows.
export default {
  test: {
    include: ["client/ui/test/*.spec.ts"],
    environment: "jsdom",
    server: {deps: {inline: [/@deepseek-ai/]}},
  },
}
