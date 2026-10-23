import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { DeskApp } from "@/components/shell/desk-app";
import { readSaved, useDesk } from "@/lib/store";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  useEffect(() => {
    useDesk.getState().hydrate(readSaved());
    useDesk.getState().ensureEquity();
  }, []);

  return <DeskApp />;
}
