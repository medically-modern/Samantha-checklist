import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import { fetchItemAssets } from "@/lib/mondayApi";
import { toast } from "sonner";

interface Props {
  itemId: string;
}

export function ClinicalsDownloadButton({ itemId }: Props) {
  const [loading, setLoading] = useState(false);

  const handleDownload = async () => {
    setLoading(true);
    try {
      const assets = await fetchItemAssets(itemId);
      if (assets.length === 0) {
        toast.info("No clinicals files found for this patient.");
        return;
      }

      // Download each file via its public_url
      for (const asset of assets) {
        const link = document.createElement("a");
        link.href = asset.public_url;
        link.download = asset.name;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // Small delay between downloads to avoid browser blocking
        if (assets.length > 1) {
          await new Promise((r) => setTimeout(r, 300));
        }
      }

      toast.success(`Downloaded ${assets.length} file${assets.length > 1 ? "s" : ""}`);
    } catch (e) {
      console.error("Clinicals download failed", e);
      toast.error("Failed to download clinicals", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleDownload}
      disabled={loading}
      className="gap-2"
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
      Clinicals
    </Button>
  );
}
