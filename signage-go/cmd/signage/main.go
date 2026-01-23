// Package main is the entry point for the signage application.
package main

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/jwulff/signage-go/internal/bloodsugar"
	"github.com/jwulff/signage-go/internal/dexcom"
	"github.com/jwulff/signage-go/internal/domain"
	"github.com/jwulff/signage-go/internal/pixoo"
	"github.com/jwulff/signage-go/internal/render"
)

func main() {
	fmt.Println("Signage - Personal Digital Signage System")
	fmt.Println("Version: 0.1.0-dev")
	fmt.Println()

	if len(os.Args) < 2 {
		showUsage()
		return
	}

	switch os.Args[1] {
	case "scan":
		scanForDevices()
	case "send":
		if len(os.Args) < 3 {
			fmt.Println("Error: IP address required")
			fmt.Println("Usage: signage send <IP>")
			os.Exit(1)
		}
		sendToDevice(os.Args[2])
	case "watch":
		if len(os.Args) < 3 {
			fmt.Println("Error: IP address required")
			fmt.Println("Usage: signage watch <IP>")
			os.Exit(1)
		}
		watchMode(os.Args[2])
	case "preview":
		previewFrame()
	default:
		showUsage()
	}
}

func showUsage() {
	fmt.Println("Usage:")
	fmt.Println("  signage scan        - Scan for Pixoo devices on local network")
	fmt.Println("  signage send <IP>   - Send a single frame to Pixoo")
	fmt.Println("  signage watch <IP>  - Continuous mode (updates every minute)")
	fmt.Println("  signage preview     - Show ASCII preview of current frame")
	fmt.Println()
	fmt.Println("Environment variables:")
	fmt.Println("  DEXCOM_USERNAME     - Dexcom Share username (optional)")
	fmt.Println("  DEXCOM_PASSWORD     - Dexcom Share password (optional)")
	fmt.Println()
	fmt.Println("When Dexcom credentials are set, blood sugar data will be displayed.")
}

func scanForDevices() {
	fmt.Println("Scanning for Pixoo devices on local network...")
	fmt.Println()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	devices, err := pixoo.ScanForDevices(ctx, func(current, total int) {
		pct := current * 100 / total
		bar := strings.Repeat("█", pct/5) + strings.Repeat("░", 20-pct/5)
		fmt.Printf("\r  [%s] %d%% (%d/%d)", bar, pct, current, total)
	})
	fmt.Println()

	if err != nil {
		fmt.Printf("\nError: %v\n", err)
		os.Exit(1)
	}

	fmt.Println()
	if len(devices) == 0 {
		fmt.Println("No Pixoo devices found.")
		fmt.Println()
		fmt.Println("Make sure your Pixoo is:")
		fmt.Println("  1. Powered on")
		fmt.Println("  2. Connected to the same WiFi network")
		fmt.Println("  3. Not in sleep mode")
	} else {
		fmt.Printf("Found %d device(s):\n", len(devices))
		fmt.Println()
		for i, device := range devices {
			fmt.Printf("  %d. %s - %s\n", i+1, device.Name, device.IP)
		}
		fmt.Println()
		fmt.Println("To start clock mode:")
		fmt.Printf("  signage watch %s\n", devices[0].IP)
	}
}

func sendToDevice(ip string) {
	fmt.Printf("Sending frame to Pixoo at %s...\n", ip)

	frame := render.ComposeClockOnlyFrame(time.Now())
	client := pixoo.NewClient(ip)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if !client.IsReachable(ctx) {
		fmt.Printf("\nError: Cannot reach Pixoo at %s\n", ip)
		fmt.Println("Make sure the IP is correct and the device is powered on.")
		os.Exit(1)
	}

	err := client.SendFrame(ctx, frame)
	if err != nil {
		fmt.Printf("\nError sending frame: %v\n", err)
		os.Exit(1)
	}

	fmt.Println("Frame sent successfully!")
}

func watchMode(ip string) {
	fmt.Printf("Starting watch mode on Pixoo at %s\n", ip)
	fmt.Println("Press Ctrl+C to stop")
	fmt.Println()

	client := pixoo.NewClient(ip)

	// Check if device is reachable
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	if !client.IsReachable(ctx) {
		cancel()
		fmt.Printf("Error: Cannot reach Pixoo at %s\n", ip)
		os.Exit(1)
	}
	cancel()

	// Check for Dexcom credentials
	dexcomUsername := os.Getenv("DEXCOM_USERNAME")
	dexcomPassword := os.Getenv("DEXCOM_PASSWORD")
	var dexcomClient *dexcom.Client
	if dexcomUsername != "" && dexcomPassword != "" {
		dexcomClient = dexcom.NewClient(dexcomUsername, dexcomPassword)
		fmt.Println("Dexcom credentials found - blood sugar enabled")
	} else {
		fmt.Println("No Dexcom credentials - clock only mode")
	}

	// Handle Ctrl+C gracefully
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	// Send initial frame immediately
	sendFrame(client, dexcomClient)

	// Create ticker that fires at the start of each minute
	ticker := createMinuteTicker()
	defer ticker.Stop()

	fmt.Println("Running. Updates every minute.")

	for {
		select {
		case <-ticker.C:
			sendFrame(client, dexcomClient)
		case <-sigChan:
			fmt.Println("\nStopping...")
			return
		}
	}
}

func sendFrame(pixooClient *pixoo.Client, dexcomClient *dexcom.Client) {
	now := time.Now()
	var frame *domain.Frame

	if dexcomClient != nil {
		// Fetch blood sugar data
		bgData, history := fetchBloodSugar(dexcomClient)

		data := render.ComposerData{
			Time:              now,
			BloodSugar:        bgData,
			BloodSugarHistory: history,
		}
		frame = render.ComposeFrame(data)
	} else {
		// Clock only
		frame = render.ComposeClockOnlyFrame(now)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	err := pixooClient.SendFrame(ctx, frame)
	if err != nil {
		fmt.Printf("[%s] Error: %v\n", now.Format("15:04:05"), err)
	} else {
		fmt.Printf("[%s] Frame sent\n", now.Format("15:04:05"))
	}
}

func fetchBloodSugar(client *dexcom.Client) (*bloodsugar.Data, []bloodsugar.HistoryPoint) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	// Fetch latest 2 readings for delta calculation
	readings, err := client.FetchReadings(ctx, 2, 30)
	if err != nil {
		fmt.Printf("  Warning: Could not fetch blood sugar: %v\n", err)
		return nil, nil
	}

	if len(readings) == 0 {
		fmt.Println("  Warning: No blood sugar readings available")
		return nil, nil
	}

	latest := readings[0]
	timestamp := dexcom.ParseTimestamp(latest.WT)

	// Calculate delta
	delta := 0
	if len(readings) > 1 {
		delta = latest.Value - readings[1].Value
	}

	data := &bloodsugar.Data{
		Glucose:     latest.Value,
		GlucoseMmol: bloodsugar.MgdlToMmol(latest.Value),
		Trend:       latest.Trend,
		TrendArrow:  bloodsugar.MapTrendArrow(latest.Trend),
		Delta:       delta,
		Timestamp:   timestamp,
		IsStale:     bloodsugar.IsStaleReading(timestamp),
		RangeStatus: bloodsugar.ClassifyRange(latest.Value),
	}

	// Fetch history for chart (24 hours)
	historyReadings, err := client.FetchReadings(ctx, 288, 1440) // ~5 min intervals for 24h
	if err != nil {
		fmt.Printf("  Warning: Could not fetch history: %v\n", err)
		return data, nil
	}

	history := make([]bloodsugar.HistoryPoint, len(historyReadings))
	for i, r := range historyReadings {
		history[i] = bloodsugar.HistoryPoint{
			Timestamp: dexcom.ParseTimestamp(r.WT),
			Value:     r.Value,
		}
	}

	return data, history
}

// createMinuteTicker creates a ticker that fires at the start of each minute.
func createMinuteTicker() *time.Ticker {
	// Calculate time until next minute
	now := time.Now()
	nextMinute := now.Truncate(time.Minute).Add(time.Minute)
	waitDuration := nextMinute.Sub(now)

	// Wait until the start of the next minute
	time.Sleep(waitDuration)

	// Now create a ticker that fires every minute
	return time.NewTicker(time.Minute)
}

func previewFrame() {
	frame := render.ComposeClockOnlyFrame(time.Now())

	fmt.Println("64x64 Frame Preview:")
	fmt.Println()
	printFrameASCII(frame)
	fmt.Println()
	fmt.Println("Legend: █=bright ▓=medium ▒=dim ░=faint ·=very dim (space)=off")
}

// printFrameASCII renders the frame as ASCII art
func printFrameASCII(frame *domain.Frame) {
	// Top border
	fmt.Print("  ┌")
	for x := 0; x < frame.Width; x++ {
		fmt.Print("─")
	}
	fmt.Println("┐")

	for y := 0; y < frame.Height; y++ {
		fmt.Printf("%2d│", y)
		for x := 0; x < frame.Width; x++ {
			pixel := frame.GetPixel(x, y)
			if pixel == nil {
				fmt.Print(" ")
				continue
			}

			brightness := (int(pixel.R) + int(pixel.G) + int(pixel.B)) / 3

			switch {
			case brightness > 200:
				fmt.Print("█")
			case brightness > 150:
				fmt.Print("▓")
			case brightness > 100:
				fmt.Print("▒")
			case brightness > 50:
				fmt.Print("░")
			case brightness > 10:
				fmt.Print("·")
			default:
				fmt.Print(" ")
			}
		}
		fmt.Println("│")
	}

	// Bottom border
	fmt.Print("  └")
	for x := 0; x < frame.Width; x++ {
		fmt.Print("─")
	}
	fmt.Println("┘")
}
