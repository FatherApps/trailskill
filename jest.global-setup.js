// Tests that format local dates expect the product's zone, not the runner's. Set here because Jest does not pass `process.env` changes made inside a test file on to the Date implementation.
module.exports = () => {
  process.env.TZ = 'America/Bogota';
};
