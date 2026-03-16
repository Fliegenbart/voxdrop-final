import { useMemo, useState } from "react";
import { PageLayout } from "@/components/PageLayout";
import { SEO } from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import {
  Copy,
  FileText,
  Globe,
  Puzzle,
  Sparkles,
} from "lucide-react";

const statusOptions = {
  konform: { label: "Konform", color: "Green", emoji: "✅" },
  teilweise: { label: "Teilweise konform", color: "Yellow", emoji: "⚠️" },
  nicht: { label: "Nicht konform", color: "Red", emoji: "⛔" },
};

const checklistRows = [
  "Tastaturbedienung",
  "Überschriftenstruktur",
  "Formulare & Labels",
  "Kontraste",
  "Alternativtexte",
  "PDF/Anhänge barrierefrei",
  "Media (Untertitel/Audiodeskription)",
];

function buildWikiMarkup(data: {
  pageTitle: string;
  status: keyof typeof statusOptions;
  contact: string;
  version: string;
  note: string;
  date: string;
}) {
  const status = statusOptions[data.status];
  const rows = checklistRows
    .map((row) => `|${row}|{status:colour=Grey|title=Prüfen}| |`)
    .join("\n");

  return [
    `h2. Barrierefreiheit – ${data.pageTitle || "Seite"}`,
    `{status:colour=${status.color}|title=${status.label}}`,
    `*Stand:* ${data.date}`,
    data.version ? `*Version:* ${data.version}` : "",
    data.contact ? `*Kontakt:* ${data.contact}` : "",
    data.note ? `*Hinweis:* ${data.note}` : "",
    "",
    "h3. Checkliste",
    "||Kriterium||Status||Kommentar||",
    rows,
  ]
    .filter(Boolean)
    .join("\n");
}

function buildMarkdown(data: {
  pageTitle: string;
  status: keyof typeof statusOptions;
  contact: string;
  version: string;
  note: string;
  date: string;
}) {
  const status = statusOptions[data.status];
  const rows = checklistRows
    .map((row) => `|${row}|Prüfen| |`)
    .join("\n");

  return [
    `## Barrierefreiheit – ${data.pageTitle || "Seite"}`,
    `Status: ${status.emoji} ${status.label}`,
    `Stand: ${data.date}`,
    data.version ? `Version: ${data.version}` : "",
    data.contact ? `Kontakt: ${data.contact}` : "",
    data.note ? `Hinweis: ${data.note}` : "",
    "",
    "### Checkliste",
    "|Kriterium|Status|Kommentar|",
    "|---|---|---|",
    rows,
  ]
    .filter(Boolean)
    .join("\n");
}

export default function ConfluenceTool() {
  const { toast } = useToast();
  const [pageTitle, setPageTitle] = useState("");
  const [status, setStatus] = useState<keyof typeof statusOptions>("konform");
  const [contact, setContact] = useState("");
  const [version, setVersion] = useState("");
  const [note, setNote] = useState("Diese Seite erfüllt die Anforderungen gemäß EN 301 549 so weit wie möglich.");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);

  const wikiMarkup = useMemo(() => buildWikiMarkup({ pageTitle, status, contact, version, note, date }), [
    pageTitle,
    status,
    contact,
    version,
    note,
    date,
  ]);

  const markdown = useMemo(() => buildMarkdown({ pageTitle, status, contact, version, note, date }), [
    pageTitle,
    status,
    contact,
    version,
    note,
    date,
  ]);

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "In die Zwischenablage kopiert" });
    } catch (error) {
      toast({ title: "Kopieren fehlgeschlagen", variant: "destructive" });
    }
  };

  return (
    <PageLayout>
      <SEO
        title="Confluence Makros"
        description="Barrierefreiheits-Makros und Checklisten für Confluence – schnell kopieren, einfügen und dokumentieren."
        canonical="/tools/confluence"
      />

      <main className="max-w-6xl mx-auto px-6 py-12">
        <header className="mb-10">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-full text-sm font-medium mb-4">
            <Puzzle className="w-4 h-4" />
            Confluence Makros
          </div>
          <h1 className="text-3xl md:text-4xl font-semibold text-slate-900 mb-3">
            Barrierefreiheit direkt in Confluence dokumentieren
          </h1>
          <p className="text-slate-600 max-w-2xl">
            Erstellen Sie sofort nutzbare Vorlagen für Status, Checklisten und Dokumentation. Ideal für interne
            Nachweise in Behörden-Projekten.
          </p>
        </header>

        <div className="grid lg:grid-cols-3 gap-8">
          <section className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Makro-Generator</h2>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-slate-700">Seitentitel</label>
                  <Input value={pageTitle} onChange={(event) => setPageTitle(event.target.value)} />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">Status</label>
                  <select
                    className="w-full mt-1 rounded-md border border-slate-200 px-3 py-2 text-sm"
                    value={status}
                    onChange={(event) => setStatus(event.target.value as keyof typeof statusOptions)}
                  >
                    {Object.entries(statusOptions).map(([key, value]) => (
                      <option key={key} value={key}>
                        {value.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">Kontakt</label>
                  <Input
                    placeholder="barrierefreiheit@behörde.de"
                    value={contact}
                    onChange={(event) => setContact(event.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">Version</label>
                  <Input
                    placeholder="v1.0"
                    value={version}
                    onChange={(event) => setVersion(event.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">Stand</label>
                  <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
                </div>
                <div className="md:col-span-2">
                  <label className="text-sm font-medium text-slate-700">Hinweis</label>
                  <Textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-slate-900">Vorlagen</h2>
                <Badge className="bg-slate-100 text-slate-700">Kopieren & Einfügen</Badge>
              </div>

              <Tabs defaultValue="wiki">
                <TabsList className="mb-4">
                  <TabsTrigger value="wiki">Confluence Wiki Markup</TabsTrigger>
                  <TabsTrigger value="markdown">Markdown/Plain</TabsTrigger>
                </TabsList>

                <TabsContent value="wiki">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm text-slate-600">Für Confluence Server / Data Center</p>
                    <Button variant="outline" size="sm" onClick={() => copyToClipboard(wikiMarkup)}>
                      <Copy className="w-4 h-4 mr-2" />
                      Kopieren
                    </Button>
                  </div>
                  <pre className="p-4 bg-slate-900 text-slate-100 rounded-lg text-xs overflow-x-auto whitespace-pre-wrap">
{wikiMarkup}
                  </pre>
                </TabsContent>

                <TabsContent value="markdown">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm text-slate-600">Für Confluence Cloud (Editor)</p>
                    <Button variant="outline" size="sm" onClick={() => copyToClipboard(markdown)}>
                      <Copy className="w-4 h-4 mr-2" />
                      Kopieren
                    </Button>
                  </div>
                  <pre className="p-4 bg-slate-900 text-slate-100 rounded-lg text-xs overflow-x-auto whitespace-pre-wrap">
{markdown}
                  </pre>
                </TabsContent>
              </Tabs>
            </div>
          </section>

          <aside className="space-y-6">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <div className="flex items-center gap-2 mb-2 text-slate-800">
                <Sparkles className="w-5 h-5 text-amber-500" />
                <h3 className="font-semibold">Best Practice</h3>
              </div>
              <p className="text-sm text-slate-600">
                Nutzen Sie die Checkliste als lebendes Dokument. Jede Seite sollte einen klaren Status und einen
                Ansprechpartner enthalten.
              </p>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <div className="flex items-center gap-2 mb-2 text-slate-800">
                <FileText className="w-5 h-5" />
                <h3 className="font-semibold">Confluence PDF → PDF/UA</h3>
              </div>
              <p className="text-sm text-slate-600 mb-4">
                Exportieren Sie die Seite als PDF und laden Sie sie im PDF/UA-Tool hoch.
              </p>
              <Link href="/tools/pptx-to-pdf-smart">
                <Button className="w-full" variant="outline">
                  <Globe className="w-4 h-4 mr-2" />
                  Zum PDF/UA Tool
                </Button>
              </Link>
            </div>
          </aside>
        </div>
      </main>

    </PageLayout>
  );
}
