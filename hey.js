module.exports = {
  root: "dist",
  webpack: {
    umd: {
      entry: "./src/index.js",
      library: "axee",
      filename: 'index.js'
    }
  }
};
