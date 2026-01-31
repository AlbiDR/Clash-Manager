
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
   */
  logReport(title: string, lines: string[], width: number = 65): void {
    const pad = (str: string, len: number) => str + " ".repeat(Math.max(0, len - str.length));
    const borderTop = `┌── ${title} ${"─".repeat(Math.max(0, width - title.length - 5))}┐`;
    const borderBot = `└${"─".repeat(width)}┘`;
    
    // @ts-ignore
    const logFunc = (typeof Logger !== "undefined") ? Logger.log : console.log;
    
    const content = lines
      .map(l => `│ ${pad(l, width - 2)} │`)
      .join("\n");

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
