# Background media

Videos and stills behind the console (Settings › Appearance › Background), read by `app/web/js/lib/scene.js`.

| File | What | Source |
|---|---|---|
| `blue-hour.webm`, `blue-hour.mp4` | Blue hour: a city skyline across a calm river just after sunset, filmed in real time (not a time-lapse), its lights reflected on the slow water. 2560×1440, 24 fps, 30 s seamless loop (the last 3 s cross-fade into the first), no audio. VP9 first (6.3 MB), H.264 where VP9 is not played (14.6 MB). | "Blue hour cityscape over tranquil river" by Chó Và Mèo, [Pexels](https://www.pexels.com/video/blue-hour-cityscape-over-tranquil-river-39414261/), Pexels License (free to use and modify, no attribution required; not to be sold or redistributed as stock on its own). |
| `blue-hour.jpg` | A still of the loop at 4 s, 1920×1080: the picture shown before the video plays and in the picker. | Same video. |

Made with ffmpeg from the 1440p original (60 s):

```
ffmpeg -i original.mp4 -filter_complex "[0:v]trim=start=3:end=33,setpts=PTS-STARTPTS[a];[0:v]trim=start=0:end=3,setpts=PTS-STARTPTS[b];[a][b]xfade=transition=fade:duration=3:offset=27,format=yuv420p[v]" -map "[v]" -an -c:v libx264 -preset slow -crf 23 -movflags +faststart blue-hour.mp4
ffmpeg -i blue-hour.mp4 -an -c:v libvpx-vp9 -b:v 0 -crf 34 -row-mt 1 -deadline good -cpu-used 3 blue-hour.webm
ffmpeg -ss 4 -i blue-hour.mp4 -frames:v 1 -vf scale=1920:-2 -q:v 3 blue-hour.jpg
```
