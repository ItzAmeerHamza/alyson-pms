const fs = require('fs');
const path = require('path');

/**
 * Template Loader Utility
 * Loads HTML templates from the renderer/templates directory
 */
class TemplateLoader {
  constructor() {
    this.templateCache = new Map();
    this.templatesDir = path.join(__dirname, '../../renderer/templates');
  }

  /**
   * Load a template by name
   * @param {string} templateName - Name of the template file (without .html extension)
   * @returns {string} The HTML content
   */
  loadTemplate(templateName) {
    // Check cache first
    if (this.templateCache.has(templateName)) {
      return this.templateCache.get(templateName);
    }

    try {
      const templatePath = path.join(this.templatesDir, `${templateName}.html`);
      const content = fs.readFileSync(templatePath, 'utf8');
      
      // Cache the content
      this.templateCache.set(templateName, content);
      
      return content;
    } catch (error) {
      console.error(`❌ [TEMPLATE-LOADER] Failed to load template "${templateName}":`, error);
      throw new Error(`Template "${templateName}" not found`);
    }
  }

  /**
   * Load template as data URL for Electron windows
   * @param {string} templateName - Name of the template file
   * @returns {string} Data URL suitable for BrowserWindow.loadURL()
   */
  getTemplateDataURL(templateName) {
    const htmlContent = this.loadTemplate(templateName);
    return `data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`;
  }

  /**
   * Clear template cache
   */
  clearCache() {
    this.templateCache.clear();
  }
}

// Export singleton instance
module.exports = new TemplateLoader();