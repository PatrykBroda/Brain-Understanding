import { BlurView } from "expo-blur";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useVideoPlayer, VideoView } from "expo-video";
import React, { useEffect, useState } from "react";
import { Platform, StyleSheet, useWindowDimensions, View, type ImageSourcePropType } from "react-native";

import { useReducedMotion } from "./motion";

/** FRAME's own imagery. The fight stills + loop are PLACEHOLDERS cut from stock clips until the client sends their edit. */
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
 * Photo behind a screen/header: full-bleed, blurred, darkened, warm orange glow
 * bleeding off the top-right, fading into the page.
 */
export function PhotoBackdrop({
  source = media.stillB,
  blur = 24,
  opacity = 0.5,
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
        colors={["rgba(214,120,40,0.30)", "rgba(214,120,40,0)"]}
        start={{ x: 1, y: 0 }}
        end={{ x: 0.2, y: 0.5 }}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={["rgba(5,5,5,0.30)", "rgba(5,5,5,0.55)", "rgba(5,5,5,0.94)"]}
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
 * hasn't failed - so it can never block signing in. Dark gradient + blur on top.
 */
export function VideoBackdrop({ blur = 14, dim = 0.3 }: { blur?: number; dim?: number }) {
  const reduced = useReducedMotion();
  const { width, height } = useWindowDimensions();
  const wide = width > height * 1.1;
  const [failed, setFailed] = useState(false);
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: "#050505" }]} pointerEvents="none">
      <Image source={wide ? media.posterWide : media.posterPortrait} contentFit="cover" style={StyleSheet.absoluteFill} />
      {!reduced && !failed ? (
        <LoopVideo source={wide ? media.videoWide : media.videoPortrait} onFail={() => setFailed(true)} />
      ) : null}
      {Platform.OS === "web" ? (
        <View style={[StyleSheet.absoluteFill, { backdropFilter: `blur(${Math.round(blur / 6)}px)`, backgroundColor: `rgba(5,5,5,${dim})` } as never]} />
      ) : (
        <>
          <BlurView intensity={blur} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(5,5,5,${dim})` }]} />
        </>
      )}
      <LinearGradient
        colors={["rgba(5,5,5,0.7)", "rgba(5,5,5,0)", "rgba(5,5,5,0.2)", "rgba(5,5,5,0.92)"]}
        locations={[0, 0.28, 0.52, 1]}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={["rgba(214,120,40,0.26)", "rgba(214,120,40,0)"]}
        start={{ x: 1, y: 0 }}
        end={{ x: 0.3, y: 0.4 }}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}
