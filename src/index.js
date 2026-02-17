module.exports = {
  Orchestrator: require('./orchestrator'),
  AgentRunner: require('./agent-runner'),
  CoordinationHub: require('./coordination-hub'),
  GitManager: require('./git-manager'),
  SafetyManager: require('./safety-manager'),
  ReportGenerator: require('./report-generator')
};

// Export all modules for external use
module.exports.ConfigManager = require('./config-manager');
module.exports.CredentialManager = require('./credential-manager');
module.exports.ParallelExecutor = require('./parallel-executor').ParallelExecutor;
module.exports.RuVectorMemory = require('./ruvector-memory');
module.exports.SonaLearner = require('./sona-learner');
module.exports.LearningDashboard = require('./learning-dashboard');
module.exports.MetricsCollector = require('./metrics-collector');
module.exports.SchemaValidator = require('./schema-validator');
module.exports.HooksCollector = require('./hooks-collector');
module.exports.ModelResolver = require('./model-resolver');
module.exports.LLMProviderManager = require('./llm-provider').LLMProviderManager;
module.exports.Agents = require('./agents');
module.exports.Init = require('./init');
module.exports.Status = require('./status');
module.exports.Recommend = require('./recommend');
module.exports.Workflow = require('./workflow');
module.exports.Pipeline = require('./pipeline');
module.exports.Coordinate = require('./coordinate');
module.exports.Rollback = require('./rollback');
module.exports.Run = require('./run');
module.exports.Interactive = require('./interactive');
module.exports.Diff = require('./diff');
module.exports.UIFormatter = require('./ui-formatter');
module.exports.OllamaCloudProvider = require('./providers/ollama-cloud');
module.exports.OllamaLocalProvider = require('./providers/ollama-local');
module.exports.ClaudeCodeProvider = require('./providers/claude-code');

// Export error handling utilities
module.exports.ErrorHandler = require('./error-handler').ErrorHandler;
module.exports.CodeSwarmError = require('./error-handler').CodeSwarmError;
module.exports.ValidationError = require('./error-handler').ValidationError;
module.exports.AuthenticationError = require('./error-handler').AuthenticationError;
module.exports.NetworkError = require('./error-handler').NetworkError;
module.exports.FileSystemError = require('./error-handler').FileSystemError;
module.exports.AgentExecutionError = require('./error-handler').AgentExecutionError;
module.exports.GitError = require('./error-handler').GitError;
module.exports.ConfigurationError = require('./error-handler').ConfigurationError;
module.exports.SafetyError = require('./error-handler').SafetyError;

// Export error handling utilities
module.exports.Errors = require('./error-handler');
module.exports.CodeSwarmError = require('./error-handler').CodeSwarmError;
module.exports.ValidationError = require('./error-handler').ValidationError;
module.exports.AuthenticationError = require('./error-handler').AuthenticationError;
module.exports.NetworkError = require('./error-handler').NetworkError;
module.exports.FileSystemError = require('./error-handler').FileSystemError;
module.exports.AgentExecutionError = require('./error-handler').AgentExecutionError;
module.exports.GitError = require('./error-handler').GitError;
module.exports.ConfigurationError = require('./error-handler').ConfigurationError;
module.exports.SafetyError = require('./error-handler').SafetyError;
module.exports.ErrorHandler = require('./error-handler').ErrorHandler;
