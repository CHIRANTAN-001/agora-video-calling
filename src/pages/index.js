import { Fragment, useEffect, useState, useRef } from "react";
import dynamic from 'next/dynamic';
import { VideoCall } from "@/component/VideoCall";


// Create a client-side only component using Next.js dynamic import
const ClientSideVideoCall = dynamic(
  () => Promise.resolve(VideoCall),
  { ssr: false }
);

export default function Home() {
  return (
    <Fragment>
      <ClientSideVideoCall />
    </Fragment>
  );
}