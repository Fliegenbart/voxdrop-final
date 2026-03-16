import { PageLayout } from "@/components/PageLayout";
import { SEO } from "@/components/SEO";

export default function VoxDropStudio() {
  return (
    <PageLayout footer={false}>
      <SEO
        title="VoxDrop Studio | Voxdrop"
        description="KI-gestuetzter Videoschnitt direkt im Browser"
        canonical="/tools/studio"
        noIndex
      />
      <div style={{ height: "calc(100vh - 64px)", overflow: "hidden" }}>
        <iframe
          title="VoxDrop Studio"
          src="/studio/#/editor"
          style={{ width: "100%", height: "100%", border: "none" }}
          allow="display-capture; microphone; camera; clipboard-read; clipboard-write; fullscreen"
          allowFullScreen
        />
      </div>
    </PageLayout>
  );
}
