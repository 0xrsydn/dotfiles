/**
 * Clipboard Image Labels
 *
 * Adds [Image #N] labels to messages that include pasted images,
 * matching the Claude Code / Codex visual style.
 *
 * Usage:
 *   - Paste:  Ctrl+V  (Alt+V on Windows)
 *   - Drag:   drag any image file onto the terminal
 *
 * When images are detected, [Image #1], [Image #2], … labels are
 * appended to the message text so they appear in the conversation
 * history and are visible to the LLM alongside the actual image data.
 *
 * A small notification confirms how many images were attached.
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
	pi.on("input", async (event, ctx) => {
		// Nothing to do when no images are attached
		if (!event.images || event.images.length === 0) {
			return { action: "continue" };
		}

		// Build [Image #N] labels – one per attached image
		const labels = event.images.map((_img, i) => `[Image #${i + 1}]`).join("  ");

		// Append labels after any typed text (or use them alone if no text)
		const newText = event.text?.trim() ? `${event.text.trim()}\n\n${labels}` : labels;

		// Brief confirmation so the user knows the paste registered
		const count = event.images.length;
		ctx.ui.notify(`📎 ${count} image${count > 1 ? "s" : ""} attached`, "info");

		// Transform keeps the original images intact; only the text changes
		return { action: "transform", text: newText };
	});
}
