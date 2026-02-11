package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"

	"github.com/jwulff/signage-go/internal/pixoo"
	"github.com/jwulff/signage-go/internal/render"
)

func main() {
	if len(os.Args) < 2 {
		fmt.Println("Usage: debug <IP>")
		os.Exit(1)
	}
	ip := os.Args[1]

	frame := render.ComposeClockOnlyFrame(time.Now())
	cmd := pixoo.CreatePixooFrameCommand(frame, nil)

	data, _ := json.MarshalIndent(cmd, "", "  ")
	fmt.Println("Command structure:")
	fmt.Printf("  Command: %s\n", cmd.Command)
	fmt.Printf("  PicNum: %d\n", cmd.PicNum)
	fmt.Printf("  PicWidth: %d\n", cmd.PicWidth)
	fmt.Printf("  PicOffset: %d\n", cmd.PicOffset)
	fmt.Printf("  PicID: %d\n", cmd.PicID)
	fmt.Printf("  PicSpeed: %d\n", cmd.PicSpeed)
	fmt.Printf("  PicData length: %d chars\n", len(cmd.PicData))
	fmt.Printf("  Full JSON size: %d bytes\n", len(data))

	// Send to device
	jsonData, _ := json.Marshal(cmd)
	url := fmt.Sprintf("http://%s:80/post", ip)
	fmt.Printf("\nSending to %s...\n", url)

	resp, err := http.Post(url, "application/json", bytes.NewReader(jsonData))
	if err != nil {
		fmt.Printf("Error: %v\n", err)
		return
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	fmt.Printf("Status: %d\n", resp.StatusCode)
	fmt.Printf("Response: %s\n", string(body))
}
