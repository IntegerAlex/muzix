#!/bin/bash
set -e

DIR="/home/akshat/projects/muzix/backend/assets"
AUDIO="$DIR/audio"
THUMB="$DIR/thumbnails"
INFO="$DIR/info"

mkdir -p "$AUDIO" "$THUMB" "$INFO"

URLS=(
  "https://www.youtube.com/watch?v=KinW-6n1YgQ"
  "https://www.youtube.com/watch?v=YR5ApYxkU_U"
  "https://www.youtube.com/watch?v=IcrbM1l_BoI"
  "https://www.youtube.com/watch?v=2Vv-BfVoq4g"
  "https://www.youtube.com/watch?v=K4DyBUGWZ3k"
  "https://www.youtube.com/watch?v=CEfCz5pQHKs"
  "https://www.youtube.com/watch?v=03O_DimGB-c"
  "https://www.youtube.com/watch?v=32Sc-CXcIOg"
  "https://www.youtube.com/watch?v=52V-ou9FYd8"
  "https://www.youtube.com/watch?v=LXb3EKWsInQ"
)

for url in "${URLS[@]}"; do
  id=$(yt-dlp --print id "$url" 2>/dev/null)
  echo "=== Downloading: $id ==="
  
  # Download audio
  yt-dlp --extract-audio --audio-format mp3 --audio-quality 192K \
    -o "$AUDIO/$id.%(ext)s" --no-playlist --no-warnings "$url" 2>&1 || echo "AUDIO FAILED"
  
  # Download thumbnail
  yt-dlp --write-thumbnail --convert-thumbnails jpg --skip-download \
    -o "$THUMB/$id.%(ext)s" --no-playlist --no-warnings "$url" 2>&1 || echo "THUMB FAILED"
  
  # Download info
  yt-dlp --write-info-json --skip-download \
    -o "$INFO/$id.%(ext)s" --no-playlist --no-warnings "$url" 2>&1 || echo "INFO FAILED"
  
  echo ""
done

echo "=== Results ==="
echo "Audio: $(ls "$AUDIO/" 2>/dev/null | wc -l) files"
echo "Thumbs: $(ls "$THUMB/" 2>/dev/null | wc -l) files"
echo "Info: $(ls "$INFO/" 2>/dev/null | wc -l) files"
ls "$AUDIO/"
