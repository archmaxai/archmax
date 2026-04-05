import { connectDB } from "@semlayer/core/infra/db";
import { DataSource, SemanticModel } from "@semlayer/core/models/index";

export interface McpTool {
  description: string;
  handler: (args: Record<string, unknown>) => Promise<{
    content: { type: string; text: string }[];
    isError?: boolean;
  }>;
}

export function getSemlayerTools(): Record<string, McpTool> {
  return {
    list_data_sources: {
      description: "List all registered data sources with their semantic descriptions",
      handler: async () => {
        await connectDB();
        const sources = await DataSource.find({ isActive: true })
          .select("name type description tables")
          .lean();
        return {
          content: [{ type: "text", text: JSON.stringify(sources, null, 2) }],
        };
      },
    },

    get_data_source: {
      description: "Get detailed information about a specific data source including table and column descriptions",
      handler: async (args) => {
        await connectDB();
        const name = args.name as string;
        const source = await DataSource.findOne({ name, isActive: true }).lean();
        if (!source) {
          return {
            content: [{ type: "text", text: `Data source "${name}" not found` }],
            isError: true,
          };
        }
        return {
          content: [{ type: "text", text: JSON.stringify(source, null, 2) }],
        };
      },
    },

    list_semantic_models: {
      description: "List all semantic models with relationships and metrics",
      handler: async () => {
        await connectDB();
        const models = await SemanticModel.find({ isActive: true })
          .populate("dataSource", "name type")
          .lean();
        return {
          content: [{ type: "text", text: JSON.stringify(models, null, 2) }],
        };
      },
    },

    get_semantic_model: {
      description: "Get a specific semantic model by name, including relationships and metrics definitions",
      handler: async (args) => {
        await connectDB();
        const name = args.name as string;
        const model = await SemanticModel.findOne({ name, isActive: true })
          .populate("dataSource")
          .lean();
        if (!model) {
          return {
            content: [{ type: "text", text: `Semantic model "${name}" not found` }],
            isError: true,
          };
        }
        return {
          content: [{ type: "text", text: JSON.stringify(model, null, 2) }],
        };
      },
    },

    describe_table: {
      description: "Get the semantic description of a specific table within a data source, including column types and relationships",
      handler: async (args) => {
        await connectDB();
        const dataSourceName = args.dataSource as string;
        const tableName = args.table as string;
        const source = await DataSource.findOne({ name: dataSourceName, isActive: true }).lean();
        if (!source) {
          return {
            content: [{ type: "text", text: `Data source "${dataSourceName}" not found` }],
            isError: true,
          };
        }
        const table = source.tables.find((t) => t.name === tableName);
        if (!table) {
          return {
            content: [{ type: "text", text: `Table "${tableName}" not found in data source "${dataSourceName}"` }],
            isError: true,
          };
        }
        return {
          content: [{ type: "text", text: JSON.stringify(table, null, 2) }],
        };
      },
    },
  };
}

export function getToolSchema(name: string): Record<string, { type: string; description?: string }> {
  switch (name) {
    case "list_data_sources":
      return {};
    case "get_data_source":
      return {
        name: { type: "string", description: "The name of the data source" },
      };
    case "list_semantic_models":
      return {};
    case "get_semantic_model":
      return {
        name: { type: "string", description: "The name of the semantic model" },
      };
    case "describe_table":
      return {
        dataSource: { type: "string", description: "The name of the data source" },
        table: { type: "string", description: "The name of the table" },
      };
    default:
      return {};
  }
}

export function getToolRequired(name: string): string[] {
  switch (name) {
    case "get_data_source":
      return ["name"];
    case "get_semantic_model":
      return ["name"];
    case "describe_table":
      return ["dataSource", "table"];
    default:
      return [];
  }
}
