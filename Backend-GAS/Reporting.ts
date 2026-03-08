/**
 * MODULE: REPORTING (Service)
 * ----------------------------------------------------------------------------
 * DESCRIPTION: Standardized logging and observability service.
 *    Provides consistent visual formatting for Execution Logs.
 * 
 * CAPABILITIES:
 *    1. Step Logging: [1/N] formatting for pipeline stages.
 *    2. Report Boxes: ASCII-art style boxes for summaries.
 *    3. Banners: High-visibility section headers.
 * 
 * VERSION: 1.1.0
 * ============================================================================
 */

export interface ReportingContract {
  logStep(step: number, total: number, message: string): void;
  logReport(title: string, lines: string[], width?: number): void;
  logBanner(message: string): void;
}

var Reporting: ReportingContract = {
  
  /**
   * Logs a standardized pipeline step: [X/Y] Message
   */
  logStep(step: number, total: number, message: string): void {
    console.info(`[${step}/${total}] ${message}`);
  },

  /**
   * Logs a high-density, frameless report.
   * Optimized for zero-token waste: Significant whitespace replaces ASCII dividers.
   */
  logReport(title: string, lines: string[]): void {
    // Header section
    let output = `\n${title.toUpperCase()}\n`;
    
    // Body section with slight indentation
    output += lines.map(l => {
      const trimmed = l.trim();
      // Use significant whitespace (empty line) as a divider
      if (trimmed === "-" || trimmed === "-" || trimmed === "=") {
        return "";
      }
      return `  ${l}`; 
    }).join("\n");

    // @ts-ignore
    const logFunc = (typeof Logger !== "undefined") ? Logger.log : console.log;
    logFunc(output + "\n");
  },

  /**
   * Logs a high-visibility banner for major section headers.
   */
  logBanner(message: string): void {
    console.log(`\n${message.toUpperCase()}\n`);
  }
};

export const VER_REPORTING = "1.2.0";

// @ts-ignore
if (typeof module !== "undefined" && module.exports) {
  module.exports = Reporting;
}

(function(scope: any) {
  Object.assign(scope, { Reporting, VER_REPORTING });
})(typeof globalThis !== 'undefined' ? globalThis : (typeof global !== 'undefined' ? global : this));

export default Reporting;
