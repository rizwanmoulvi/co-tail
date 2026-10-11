/** pm2 apps: the site, the worker, and the Agent Studio seller. `npx pm2 start ecosystem.config.cjs` */
module.exports = {
  apps: [
    {
      name: "tailcoat-web",
      cwd: __dirname,
      script: "node_modules/.bin/next",
      args: "start -p 3300",
      env: { NODE_ENV: "production" },
      max_memory_restart: "600M",
    },
    {
      name: "tailcoat-worker",
      cwd: __dirname,
      script: "node_modules/.bin/tsx",
      args: "--env-file=.env worker/index.ts",
      max_memory_restart: "600M",
      restart_delay: 5000,
    },
    {
      name: "tailcoat-agent",
      cwd: `${__dirname}/agent/tailcoatreader/app/agent`,
      script: "/usr/local/bin/bag",
      args: "dev --port 9000",
      max_memory_restart: "600M",
      restart_delay: 5000,
    },
  ],
}
