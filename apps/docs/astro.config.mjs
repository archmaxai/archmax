import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

export default defineConfig({
  site: "https://archmaxai.github.io",
  base: "/archmax",
  integrations: [
    starlight({
      title: "archmax",
      description:
        "Manage semantic descriptions of your databases and expose them to AI agents via MCP.",
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/archmaxai/archmax",
        },
      ],
      editLink: {
        baseUrl:
          "https://github.com/archmaxai/archmax/edit/main/apps/docs/",
      },
      sidebar: [
        {
          label: "Getting Started",
          items: [
            { label: "Installation", slug: "getting-started/installation" },
            { label: "Quickstart", slug: "getting-started/quickstart" },
          ],
        },
        {
          label: "Guides",
          items: [
            { label: "Semantic Models", slug: "guides/semantic-models" },
            { label: "MCP Integration", slug: "guides/mcp-integration" },
            { label: "Data Federation", slug: "guides/data-federation" },
            { label: "Testing", slug: "guides/testing" },
            { label: "Self-Hosting", slug: "guides/self-hosting" },
          ],
        },
        {
          label: "Reference",
          items: [
            { label: "MCP Tools", slug: "reference/mcp-tools" },
            { label: "Configuration", slug: "reference/configuration" },
            { label: "Docker", slug: "reference/docker" },
          ],
        },
        {
          label: "Contributing",
          items: [
            { label: "Development Setup", slug: "contributing/development" },
            { label: "OpenSpec Workflow", slug: "contributing/openspec" },
          ],
        },
      ],
      customCss: ["./src/styles/custom.css"],
    }),
  ],
});
