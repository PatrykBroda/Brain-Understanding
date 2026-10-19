import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useVideoPlayer, VideoView } from "expo-video";
import React, { useEffect, useState } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { palette, radius, space } from "@/constants/entryTheme";
import { useReducedMotion } from "./motion";

/** FRAME's own imagery: the client's edit (monochrome, Pineapple sponsor card cut out), 576x1024, no audio. */
export const media = {
  poster: require("../../assets/images/frame-auth-poster.jpg") as number,
  video: require("../../assets/video/frame-auth.mp4") as number,
};

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

/** Flat dark scrim over the whole loop on every pre-login screen (on top of the band gradient below). */
export const AUTH_SCRIM = 0.5;
/** Opacity of the dark translucent panel the pre-login forms sit on ("behind a screen"). */
export const AUTH_PANEL_ALPHA = 0.88;

/**
 * Dark translucent panel for pre-login forms/copy: the loop shows faintly
 * through, but labels, inputs, placeholders and errors always sit on a
 * near-black plate (contrast checked against the brightest loop frame).
 */
export function AuthPanel({ children, style }: { children?: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[authPanel.box, style]}>{children}</View>;
}

const authPanel = StyleSheet.create({
  box: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.borderStrong,
    backgroundColor: `rgba(8,9,11,${AUTH_PANEL_ALPHA})`,
    padding: space.xl,
  },
});

/**
 * Looping muted background video for sign-in / sign-up / splash.
 * Poster image underneath always; video only when motion is allowed and it
 * hasn't failed - so it can never block signing in. Neutral dark scrim on top
 * that keeps the top and bottom bands dark (reserved for the wordmark and the
 * headline/controls). No blur, no colour grade: imagery is monochrome.
 */
export function VideoBackdrop({ dim = AUTH_SCRIM }: { dim?: number }) {
  const reduced = useReducedMotion();
  const [failed, setFailed] = useState(false);
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: palette.bg }]} pointerEvents="none">
      <Image source={media.poster} contentFit="cover" style={StyleSheet.absoluteFill} />
      {!reduced && !failed ? (
        <LoopVideo source={media.video} onFail={() => setFailed(true)} />
      ) : null}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(8,9,11,${dim})` }]} />
      <LinearGradient
        // lighter bottom bands so the loop reads edge to edge, not just the top half (Patryk, 19 Oct)
        colors={["rgba(8,9,11,0.6)", "rgba(8,9,11,0.1)", "rgba(8,9,11,0.2)", "rgba(8,9,11,0.5)", "rgba(8,9,11,0.7)"]}
        locations={[0, 0.22, 0.48, 0.74, 1]}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}
