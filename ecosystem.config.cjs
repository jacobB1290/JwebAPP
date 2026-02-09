const fs = require('fs');
const path = require('path');

// Read .env.local and parse into env object
const envPath = path.join(__dirname, '.env.local');
const envVars = {};
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const match = line.match(/^([^#=\s]+)\s*=\s*(.+)/);
    if (match) envVars[match[1].trim()] = match[2].trim();
  });
}

module.exports = {
  apps: [
    {
      name: 'smart-notebook',
      script: 'npx',
      args: 'next start -p 3000',
      cwd: __dirname,
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        // Force direct OpenAI API (override sandbox proxy)
        OPENAI_BASE_URL: 'https://api.openai.com/v1',
        // Explicitly pass all .env.local vars
        ...envVars,
      },
      watch: false,
      instances: 1,
      exec_mode: 'fork',
    }
  ]
}
