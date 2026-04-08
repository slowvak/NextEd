export default {
  server: {
    port: 5273,
    proxy: {
      '/api': {
        target: 'http://localhost:8050',
        changeOrigin: true,
        ws: true,
      },
    },
  },
};
