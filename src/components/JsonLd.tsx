/**
 * Renders a schema.org graph as JSON-LD. `<` is escaped so a market title or a
 * resolution note can never close the script tag.
 */
export function JsonLd({ data }: { data: object }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}
