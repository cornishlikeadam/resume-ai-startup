const { createApp } = require("./app.cjs");
const port = Number(process.env.PORT || 3001);
createApp().listen(port, "127.0.0.1", () =>
  console.log(`resume.ai API listening on ${port}`),
);
