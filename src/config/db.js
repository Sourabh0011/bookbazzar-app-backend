const { prisma, connectDB } = require('./prisma');

module.exports = connectDB;
module.exports.prisma = prisma;
module.exports.connectDB = connectDB;
