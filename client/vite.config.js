// Copyright Bradley J Erickson, 2026.
export default {
  server: {
    port: 5275,
    proxy: {
      '/api': {
        target: 'http://localhost:8060',
        changeOrigin: true,
        ws: true,
        timeout: 0,
        proxyTimeout: 0,
      },
    },
  },
};
