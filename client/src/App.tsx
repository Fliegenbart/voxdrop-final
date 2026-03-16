import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Route, Switch, useLocation } from "wouter";
import { AgencyModeProvider } from "@/lib/agency-mode";
import { AuthProvider, useAuth } from "@/lib/auth";
import { UpgradeModal } from "@/components/UpgradeModal";
import Home from "@/pages/home";
import Pricing from "@/pages/pricing";
import Features from "@/pages/features";
import VoxDrop2030 from "@/pages/voxdrop-2030";
import BlogIndex from "@/pages/blog/index";
import FaktenZurBarrierefreiheit from "@/pages/blog/fakten-zur-barrierefreiheit";
import BfsgLeitfaden from "@/pages/blog/bfsg-2025-leitfaden";
import BfsgCheck from "@/pages/bfsg-check";
import BarrierefreiheitIstUx from "@/pages/blog/barrierefreiheit-ist-ux";
import BfsgKommunenLeitfaden from "@/pages/blog/bfsg-kommunen-leitfaden";
import BitvCheckliste from "@/pages/blog/bitv-checkliste";
import BarrierefreieFormulare from "@/pages/blog/barrierefreie-formulare";
import DigitaleTeilhabe from "@/pages/blog/digitale-teilhabe";
import LeichteSpracheKI from "@/pages/blog/leichte-sprache-ki";
import ScreenreaderTest from "@/pages/blog/screenreader-test";
import TextToSpeech from "@/pages/blog/text-to-speech";
import DynamicBlogPost from "@/pages/blog/dynamic-post";
import AdminBlogEditor from "@/pages/admin/blog";
import Datenschutz from "@/pages/datenschutz";
import Impressum from "@/pages/impressum";
import Login from "@/pages/login";
import Register from "@/pages/register";
import Settings from "@/pages/settings";
import Documents from "@/pages/documents";
import WorkspaceInvite from "@/pages/workspace-invite";
import KontrastChecker from "@/pages/tools/kontrastchecker";
import EinfacheSprache from "@/pages/tools/einfache-sprache";
import PptxPodcast from "@/pages/tools/pptx-podcast";
import PersonaCheck from "@/pages/tools/persona-check";
import PptxSummary from "@/pages/tools/pptx-summary";
import PptxToPdfSmart from "@/pages/tools/pptx-to-pdf-smart";
import DotsFirstTestTool from "@/pages/tools/dots-first-test";
import UrlShortener from "@/pages/tools/url-shortener";
import Untertitel from "@/pages/tools/untertitel";
import UntertitelBehoerde from "@/pages/tools/untertitel-behoerde";
import Videoschnitt from "@/pages/tools/videoschnitt";
import VoxCut from "@/pages/tools/voxcut/index";
import AltText from "@/pages/tools/alt-text";
import AriaChecker from "@/pages/tools/aria-checker";
import VPATChecker from "@/pages/tools/vpat-checker";
import WebPrüfung from "@/pages/tools/web-pruefung";
import PdfuaCheck from "@/pages/tools/pdfua-check";
import ProxyTest from "@/pages/tools/proxy-test";
import FileSharing from "@/pages/tools/filesharing";
import VoxDropStudio from "@/pages/tools/openreel-lab";
import ConfluenceTool from "@/pages/tools/confluence";
import WordToPdfUA from "@/pages/tools/word-to-pdfua";
import ComplianceTimeline from "@/pages/dashboard/compliance-timeline";
import FileDownload from "@/pages/file-download";
import ComingSoonTool from "@/pages/tools/coming-soon";
import NotFound from "@/pages/not-found";
import Behörden from "@/pages/behoerden";
import AVV from "@/pages/avv";
import TOMs from "@/pages/toms";
import Subunternehmer from "@/pages/subunternehmer";
import Leistungsbeschreibung from "@/pages/leistungsbeschreibung";
import SLA from "@/pages/sla";
import ExitKonzept from "@/pages/exit-konzept";
import C5Mapping from "@/pages/c5-mapping";
import BarrierefreiheitErklärung from "@/pages/barrierefreiheit-erklaerung";
import AvatarTool from "@/pages/avatar";
import PitchDeck from "@/pages/pitch";
import VideoSuite from "@/pages/video";

function CanonicalizeTrailingSlash() {
  const [location, setLocation] = useLocation();

  useEffect(() => {
    // Static hosting may redirect `/path` -> `/path/` for directory index.html.
    // Our router paths are defined without trailing slashes, so normalize once client-side.
    if (location.length > 1 && location.endsWith("/")) {
      setLocation(location.slice(0, -1), { replace: true });
    }
  }, [location, setLocation]);

  return null;
}

// Global Upgrade Modal wrapper
function GlobalUpgradeModal() {
  const { showUpgradeModal, closeUpgradeModal, upgradeModalType, usage } = useAuth();
  const usageCounts =
    upgradeModalType === 'transcriptions'
      ? { used: usage?.transcriptions, limit: usage?.limits?.transcriptions }
      : upgradeModalType === 'videos'
      ? { used: usage?.videos, limit: usage?.limits?.videos }
      : { used: undefined, limit: undefined };

  return (
    <UpgradeModal
      isOpen={showUpgradeModal}
      onClose={closeUpgradeModal}
      type={upgradeModalType}
      usedCount={usageCounts.used}
      limitCount={usageCounts.limit}
    />
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AgencyModeProvider>
        <AuthProvider>
        <CanonicalizeTrailingSlash />
        <Toaster />
        <Switch>
        {/* Auth pages */}
        <Route path="/login" component={Login} />
        <Route path="/anmelden" component={Login} />
        <Route path="/register" component={Register} />
        <Route path="/registrieren" component={Register} />
        <Route path="/settings" component={Settings} />
        <Route path="/einstellungen" component={Settings} />
        <Route path="/documents" component={Documents} />
        <Route path="/workspace-invite" component={WorkspaceInvite} />
        <Route path="/admin/blog" component={AdminBlogEditor} />

        {/* Main pages */}
        <Route path="/" component={Home} />
        <Route path="/preise" component={Pricing} />
        <Route path="/features" component={Features} />
        <Route path="/voxdrop-2030" component={VoxDrop2030} />
        <Route path="/bfsg-check" component={BfsgCheck} />
        <Route path="/bfsg-check/:rest*" component={BfsgCheck} />
        <Route path="/video" component={VideoSuite} />
        <Route path="/behoerden" component={Behörden} />
        <Route path="/avatar" component={AvatarTool} />
        <Route path="/datenschutz" component={Datenschutz} />
        <Route path="/impressum" component={Impressum} />
        <Route path="/avv" component={AVV} />
        <Route path="/toms" component={TOMs} />
        <Route path="/subunternehmer" component={Subunternehmer} />
        <Route path="/leistungsbeschreibung" component={Leistungsbeschreibung} />
        <Route path="/sla" component={SLA} />
        <Route path="/exit-konzept" component={ExitKonzept} />
        <Route path="/c5-mapping" component={C5Mapping} />
        <Route path="/barrierefreiheit-erklaerung" component={BarrierefreiheitErklärung} />

        {/* Hidden pages (not in navigation) */}
        <Route path="/pitch" component={PitchDeck} />

        {/* Blog */}
        <Route path="/blog" component={BlogIndex} />
        <Route path="/blog/barrierefreiheit-ist-ux" component={BarrierefreiheitIstUx} />
        <Route path="/blog/bfsg-2025-leitfaden" component={BfsgLeitfaden} />
        <Route path="/blog/fakten-zur-barrierefreiheit" component={FaktenZurBarrierefreiheit} />
        <Route path="/blog/bfsg-kommunen-leitfaden" component={BfsgKommunenLeitfaden} />
        <Route path="/blog/bitv-checkliste" component={BitvCheckliste} />
        <Route path="/blog/barrierefreie-formulare" component={BarrierefreieFormulare} />
        <Route path="/blog/digitale-teilhabe" component={DigitaleTeilhabe} />
        <Route path="/blog/leichte-sprache-ki" component={LeichteSpracheKI} />
        <Route path="/blog/screenreader-test" component={ScreenreaderTest} />
        <Route path="/blog/text-to-speech" component={TextToSpeech} />
        <Route path="/blog/:slug" component={DynamicBlogPost} />

        {/* Tools */}
        <Route path="/tools/untertitel" component={Untertitel} />
        <Route path="/tools/untertitel/behoerde" component={UntertitelBehoerde} />
        {/* Route invariant: keep classic Videoschnitt here, keep VoxCut on /tools/voxcut */}
        <Route path="/tools/untertitel/videoschnitt" component={Videoschnitt} />
        <Route path="/tools/voxcut" component={VoxCut} />
        <Route path="/tools/redeschnitt" component={VoxCut} />
        <Route path="/tools/voiceover" component={RedirectToSchnittStruktur} />
        <Route path="/tools/pptx-podcast" component={PptxPodcast} />
        <Route path="/tools/pptx-pdf" component={RedirectToSmart} />
        <Route path="/tools/pptx-summary" component={PptxSummary} />
        <Route path="/tools/pptx-to-pdf-smart" component={PptxToPdfSmart} />
        <Route path="/tools/dots-first-test" component={DotsFirstTestTool} />
        <Route path="/tools/word-to-pdfua" component={WordToPdfUA} />
        <Route path="/tools/einfache-sprache" component={EinfacheSprache} />
        <Route path="/tools/kontrastchecker" component={KontrastChecker} />
        <Route path="/tools/persona-check" component={PersonaCheck} />
        <Route path="/tools/url-shortener" component={UrlShortener} />
        <Route path="/tools/alt-text" component={AltText} />
        <Route path="/tools/aria-checker" component={AriaChecker} />
        <Route path="/tools/web-pruefung" component={WebPrüfung} />
        <Route path="/tools/formular-check" component={PdfuaCheck} />
        <Route path="/tools/pdfua-check" component={RedirectToFormularCheck} />
        <Route path="/tools/proxy-test" component={ProxyTest} />
        <Route path="/tools/filesharing" component={FileSharing} />
        <Route path="/tools/studio" component={VoxDropStudio} />
        <Route path="/tools/openreel-lab" component={VoxDropStudio} />
        <Route path="/tools/reports" component={RedirectToVpat} />
        <Route path="/tools/vpat-checker" component={VPATChecker} />
        <Route path="/dashboard/compliance" component={ComplianceTimeline} />
        <Route path="/f/:token" component={FileDownload} />
        <Route path="/tools/audiodeskription">
          <ComingSoonTool toolId="audiodeskription" />
        </Route>
        <Route path="/tools/confluence">
          <ConfluenceTool />
        </Route>
        <Route path="/tools/live-transkription">
          <ComingSoonTool toolId="live-transkription" />
        </Route>

        {/* Redirect /tools to home */}
        <Route path="/tools">
          <Home />
        </Route>

        {/* 404 Fallback */}
        <Route component={NotFound} />
        </Switch>
        <GlobalUpgradeModal />
      </AuthProvider>
      </AgencyModeProvider>
    </QueryClientProvider>
  );
}

function RedirectToSmart() {
  const [, setLocation] = useLocation();
  useEffect(() => {
    setLocation("/tools/pptx-to-pdf-smart");
  }, [setLocation]);
  return null;
}

function RedirectToVpat() {
  const [, setLocation] = useLocation();
  useEffect(() => {
    setLocation("/tools/vpat-checker");
  }, [setLocation]);
  return null;
}

function RedirectToSchnittStruktur() {
  const [, setLocation] = useLocation();
  useEffect(() => {
    setLocation("/tools/untertitel/videoschnitt");
  }, [setLocation]);
  return null;
}

function RedirectToFormularCheck() {
  const [, setLocation] = useLocation();
  useEffect(() => {
    setLocation("/tools/formular-check");
  }, [setLocation]);
  return null;
}

export default App;
