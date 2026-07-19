// api/multi-agent-task-queue.js
// Autonomous task delegation system — routes work to specialized agents in parallel

const Anthropic = require("@anthropic-ai/sdk");
const client = new Anthropic();

class TaskQueue {
  constructor() {
    this.tasks = [];
    this.workers = {
      estimate: require('./estimator-agent'),
      govcon: require('./govcon-scanner'),
      email: require('./email-agent'),
      invoice: require('./invoice-agent'),
      forecast: require('./predictive-lead-scoring'),
    };
  }

  async submitTask(task) {
    task.id = Date.now();
    task.status = 'queued';
    task.createdAt = new Date();
    this.tasks.push(task);
    this.process();
    return task.id;
  }

  async process() {
    const queued = this.tasks.filter((t) => t.status === 'queued');
    if (queued.length === 0) return;

    // Process up to 5 tasks in parallel
    const batch = queued.slice(0, 5);
    const promises = batch.map((task) => this.executeTask(task));
    await Promise.all(promises);
  }

  async executeTask(task) {
    task.status = 'processing';
    try {
      let result;
      switch (task.type) {
        case 'estimate':
          result = await this.workers.estimate.generateEstimate(task.data);
          break;
        case 'govcon-scan':
          result = await this.workers.govcon.scanSAM(task.data);
          break;
        case 'send-email':
          result = await this.workers.email.sendEmail(task.data);
          break;
        case 'generate-invoice':
          result = await this.workers.invoice.generateInvoice(task.data);
          break;
        case 'score-lead':
          result = await this.workers.forecast.scoreLeadPredictively(task.data);
          break;
        default:
          throw new Error(\Unknown task type: \\);
      }
      task.status = 'completed';
      task.result = result;
      task.completedAt = new Date();
    } catch (error) {
      task.status = 'failed';
      task.error = error.message;
      task.failedAt = new Date();
    }
  }

  getStatus(taskId) {
    return this.tasks.find((t) => t.id === taskId);
  }

  getAllTasks() {
    return this.tasks.sort((a, b) => b.createdAt - a.createdAt);
  }
}

const queue = new TaskQueue();

module.exports = { queue, TaskQueue };
