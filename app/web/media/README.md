# Background media

Videos and stills behind the console (Settings › Appearance › Background), read by `app/web/js/lib/scene.js`.

| File | What | Source |
|---|---|---|
| `blue-hour.webm`, `blue-hour.mp4` | Blue hour: a city skyline across a calm river just after sunset, filmed in real time (not a time-lapse), its lights reflected on the slow water. 2560×1440, 24 fps, 30 s seamless loop (the last 3 s cross-fade into the first), no audio. VP9 first (6.3 MB), H.264 where VP9 is not played (14.6 MB). | "Blue hour cityscape over tranquil river" by Chó Và Mèo, [Pexels](https://www.pexels.com/video/blue-hour-cityscape-over-tranquil-river-39414261/), Pexels License (free to use and modify, no attribution required; not to be sold or redistributed as stock on its own). |
| `blue-hour.jpg` | A still of the loop at 4 s, 1920×1080: the picture shown before the video plays and in the picker. | Same video. |
| `night-sky.webm`, `night-sky.mp4`, `night-sky.jpg` | Night sky: clouds drifting over a town at dusk, a lit tower on the horizon, in time-lapse. 2560×1440 from the 4K original, 25 fps, 27.5 s seamless loop (2 s cross-fade), no audio. VP9 0.8 MB, H.264 6.9 MB. | "Time-lapse of night sky" by Pouya Lucky, [Pexels](https://www.pexels.com/video/time-lapse-of-night-sky-12545598/), Pexels License. |
| `fireworks.webm`, `fireworks.mp4`, `fireworks.jpg` | Fireworks: New Year's fireworks over the Dubai coastline. 1920×1080 (the original's size), 24 fps, 24.9 s seamless loop (3 s cross-fade), audio removed. VP9 4.5 MB, H.264 6.8 MB. | "Fireworks over the city of Dubai during New Year's celebrations" by Lay-Z Owl, [Pexels](https://www.pexels.com/video/fireworks-over-the-city-of-dubai-during-new-year-s-celebrations-14980079/), Pexels License. |
| `geometric.webm`, `geometric.mp4`, `geometric.jpg` | Red and blue: soft red and blue geometric shapes moving on black. 2560×1440 from the 4K original, 29.97 fps, 18 s seamless loop (2 s cross-fade), no audio. VP9 0.8 MB, H.264 4.9 MB. | "Futuristic geometric red and blue background" by Chandresh Uike, [Pexels](https://www.pexels.com/video/futuristic-geometric-red-and-blue-background-31723728/), Pexels License. |

The stills are taken at 4 s of each loop (10 s for Fireworks, when the sky is lit), 1920 px wide. The three later scenes are made the same
way as Blue hour, with the cross-fade length `X` and the original's duration `D`
(`-vf scale=2560:1440` added for the 4K originals):

```
ffmpeg -i original.mp4 -filter_complex "[0:v]trim=start=X:end=D,setpts=PTS-STARTPTS[a];[0:v]trim=start=0:end=X,setpts=PTS-STARTPTS[b];[a][b]xfade=transition=fade:duration=X:offset=D-2X,scale=2560:1440,format=yuv420p[v]" -map "[v]" -an -c:v libx264 -preset slow -crf 23 -movflags +faststart name.mp4
```

Blue hour was made with ffmpeg from the 1440p original (60 s):

```
ffmpeg -i original.mp4 -filter_complex "[0:v]trim=start=3:end=33,setpts=PTS-STARTPTS[a];[0:v]trim=start=0:end=3,setpts=PTS-STARTPTS[b];[a][b]xfade=transition=fade:duration=3:offset=27,format=yuv420p[v]" -map "[v]" -an -c:v libx264 -preset slow -crf 23 -movflags +faststart blue-hour.mp4
ffmpeg -i blue-hour.mp4 -an -c:v libvpx-vp9 -b:v 0 -crf 34 -row-mt 1 -deadline good -cpu-used 3 blue-hour.webm
ffmpeg -ss 4 -i blue-hour.mp4 -frames:v 1 -vf scale=1920:-2 -q:v 3 blue-hour.jpg
```
