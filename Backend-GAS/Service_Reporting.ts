
/**
 * ============================================================================
 * 📢 MODULE: REPORTING (Service)
 * ----------------------------------------------------------------------------
 * 📝 DESCRIPTION: Standardized logging and observability service.
 *    Provides consistent visual formatting for Execution Logs.
 * 
 * ⚙️ CAPABILITIES:
 *    1. Step Logging: [1/N] formatting for pipeline stages.
 *    2. Report Boxes: ASCII-art style boxes for summaries.
 *    3. Banners: High-visibility section headers.
 * 
 * 🏷️ VERSION: 1.0.0
 * ============================================================================
 */

export interface IReporting {
  logStep(step: number, total: number, message: string): void;
  logReport(title: string, lines: string[], width?: number): void;
  logBanner(message: string): void;
}

var Reporting: IReporting = {
  
  /**
   * Logs a standardized pipeline step: [Step X/Y] Message
   */
  logStep(step: number, total: number, message: string): void {
    console.info(`[${step}/${total}] ${message}`);
  },

  /**
   * Logs a stylized report box to the console.
   * Optimized for Gemini quota by reducing whitespace padding.
   */
  logReport(title: string, lines: string[], width?: number): void {
    const padding = 2; // Left + Right padding characters
    const minWidth = title.length + 8;
    
    // Calculate optimal width based on content
    const maxContent = lines.reduce((max, line) => {
      // Ignore lines intended to be separators for width calculation
      if (line.trim().startsWith("─") || line.trim().startsWith("-")) return max;
      return Math.max(max, line.length);
    }, 0);
    
    const finalWidth = width || Math.max(minWidth, maxContent + 4);
    const contentWidth = finalWidth - 4; // Space available inside │ │

    const pad = (str: string, len: number) => {
      if (str.length >= len) return str.substring(0, len);
      return str + " ".repeat(len - str.length);
    };

    const borderTop = `┌── ${title} ${"─".repeat(Math.max(0, finalWidth - title.length - 5))}┐`;
    const borderBot = `└${"─".repeat(finalWidth - 2)}┘`;
    
    // @ts-ignore
    const logFunc = (typeof Logger !== "undefined") ? Logger.log : console.log;
    
    const content = lines.map(l => {
      const trimmed = l.trim();
      // Smart Dividers: If line starts with divider char, repeat it for full width
      if (trimmed === "─" || trimmed === "-" || trimmed === "=") {
        return `├${trimmed.repeat(finalWidth - 2)}┤`;
      }
      return `│ ${pad(l, contentWidth)} │`;
    }).join("\n");

    logFunc(`\n${borderTop}\n${content}\n${borderBot}\n`);
  },

  /**
   * Logs a high-visibility banner for major section headers.
   */
  logBanner(message: string): void {
    console.log(`\n============== ${message.toUpperCase()} ==============\n`);
  }
};

export const VER_REPORTING = "1.0.0";

// @ts-ignore
if (typeof module !== "undefined" && module.exports) {
  module.exports = Reporting;
}

(function(scope: any) {
  Object.assign(scope, { Reporting, VER_REPORTING });
})(typeof globalThis !== 'undefined' ? globalThis : (typeof global !== 'undefined' ? global : this));

export default Reporting;
