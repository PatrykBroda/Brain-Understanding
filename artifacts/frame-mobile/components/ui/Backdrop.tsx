import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useVideoPlayer, VideoView } from "expo-video";
import React, { useEffect, useState } from "react";
import { StyleSheet, useWindowDimensions, View, type ImageSourcePropType } from "react-native";

import { palette } from "@/constants/theme";
import { useReducedMotion } from "./motion";

/** FRAME's own imagery. All assets are graded MONOCHROME. The fight stills + loop are PLACEHOLDERS cut from stock clips (third-party: must not ship) until the client sends their edit. */
export const media = {
  gym: require("../../assets/images/login-hero.jpg") as number,
  stillA: require("../../assets/images/fight-still-a.jpg") as number,
  stillB: require("../../assets/images/fight-still-b.jpg") as number,
  posterPortrait: require("../../assets/images/frame-auth-portrait-poster.jpg") as number,
  posterWide: require("../../assets/images/frame-auth-wide-poster.jpg") as number,
  videoPortrait: require("../../assets/video/frame-auth-portrait.mp4") as number,
  videoWide: require("../../assets/video/frame-auth-wide.mp4") as number,
};

/**
 * Monochrome photo behind a hero/header block (NOT whole app screens): full-bleed,
 * darkened, with a dark scrim that reserves a stable band for text.
 */
export function PhotoBackdrop({
  source = media.stillB,
  blur = 0,
  opacity = 0.55,
  position = "center",
}: {
  source?: ImageSourcePropType;
  blur?: number;
  opacity?: number;
  position?: string;
}) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Image
        source={source}
        contentFit="cover"
        contentPosition={position as never}
        blurRadius={Math.round(blur / 2)}
        style={[StyleSheet.absoluteFill, { opacity }]}
      />
      <LinearGradient
        colors={["rgba(8,9,11,0.35)", "rgba(8,9,11,0.6)", "rgba(8,9,11,0.96)"]}
        locations={[0, 0.55, 1]}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

function LoopVideo({ source, onFail }: { source: number; onFail: () => void }) {
  const player = useVideoPlayer(source, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });
  useEffect(() => {
    // play() before the native/web view attaches can be dropped: replay once it's ready
    const sub = player.addListener("statusChange", ({ status }) => {
      if (status === "error") onFail();
      else if (status === "readyToPlay" && !player.playing) player.play();
    });
    const kick = setTimeout(() => {
      if (!player.playing) player.play();
    }, 400);
    return () => {
      clearTimeout(kick);
      sub.remove();
    };
  }, [player, onFail]);
  return (
    <VideoView
      player={player}
      style={StyleSheet.absoluteFill}
      contentFit="cover"
      nativeControls={false}
      allowsPictureInPicture={false}
      pointerEvents="none"
    />
  );
}

/**
 * Looping muted background video for sign-in / sign-up / splash.
 * Poster image underneath always; video only when motion is allowed and it
 * hasn't failed - so it can never block signing in. Neutral dark scrim on top
 * that keeps the top and bottom bands dark (reserved for the wordmark and the
 * headline/controls). No blur, no colour grade: imagery is monochrome.
 */
export function VideoBackdrop({ dim = 0.2 }: { dim?: number }) {
  const reduced = useReducedMotion();
  const { width, height } = useWindowDimensions();
  const wide = width > height * 1.1;
  const [failed, setFailed] = useState(false);
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: palette.bg }]} pointerEvents="none">
      <Image source={wide ? media.posterWide : media.posterPortrait} contentFit="cover" style={StyleSheet.absoluteFill} />
      {!reduced && !failed ? (
        <LoopVideo source={wide ? media.videoWide : media.videoPortrait} onFail={() => setFailed(true)} />
      ) : null}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(8,9,11,${dim})` }]} />
      <LinearGradient
        colors={["rgba(8,9,11,0.78)", "rgba(8,9,11,0.08)", "rgba(8,9,11,0.55)", "rgba(8,9,11,0.94)", "rgba(8,9,11,0.98)"]}
        locations={[0, 0.22, 0.48, 0.74, 1]}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}
