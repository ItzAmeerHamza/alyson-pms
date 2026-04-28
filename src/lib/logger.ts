const isProduction = process.env.NODE_ENV === 'production';

export const logger = {
  debug: (...args: any[]) => {
    if (!isProduction) {
      console.debug(...args);
    }
  },
  log: (...args: any[]) => {
    if (!isProduction) {
      console.log(...args);
    }
  },
  info: (...args: any[]) => {
    if (!isProduction) {
      console.info(...args);
    }
  },
  warn: (...args: any[]) => {
    console.warn(...args); // Always show warnings
  },
  error: (...args: any[]) => {
    console.error(...args); // Always show errors
  }
};

export default logger; 