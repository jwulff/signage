package pixoo

import (
	"context"
	"fmt"
	"net"
	"sync"
	"time"
)

// DiscoveredDevice represents a found Pixoo device.
type DiscoveredDevice struct {
	Name string
	IP   string
}

// ProgressFunc is called during scanning to report progress.
type ProgressFunc func(current, total int)

// ScanForDevices scans the local subnet for Pixoo devices.
func ScanForDevices(ctx context.Context, onProgress ProgressFunc) ([]DiscoveredDevice, error) {
	subnet, err := getLocalSubnet()
	if err != nil {
		return nil, err
	}

	var devices []DiscoveredDevice
	var mu sync.Mutex
	var wg sync.WaitGroup

	// Scan in batches of 50 concurrent probes
	batchSize := 50
	total := 254

	for start := 1; start <= total; start += batchSize {
		end := start + batchSize - 1
		if end > total {
			end = total
		}

		// Launch batch
		for i := start; i <= end; i++ {
			wg.Add(1)
			go func(ip string) {
				defer wg.Done()

				device := probePixoo(ctx, ip)
				if device != nil {
					mu.Lock()
					devices = append(devices, *device)
					mu.Unlock()
				}
			}(fmt.Sprintf("%s.%d", subnet, i))
		}

		// Wait for batch to complete
		wg.Wait()

		// Report progress
		if onProgress != nil {
			onProgress(end, total)
		}

		// Check for cancellation
		select {
		case <-ctx.Done():
			return devices, ctx.Err()
		default:
		}
	}

	return devices, nil
}

// getLocalSubnet returns the local subnet (e.g., "192.168.1").
func getLocalSubnet() (string, error) {
	interfaces, err := net.Interfaces()
	if err != nil {
		return "", fmt.Errorf("failed to get network interfaces: %w", err)
	}

	for _, iface := range interfaces {
		// Skip loopback and down interfaces
		if iface.Flags&net.FlagLoopback != 0 || iface.Flags&net.FlagUp == 0 {
			continue
		}

		addrs, err := iface.Addrs()
		if err != nil {
			continue
		}

		for _, addr := range addrs {
			ipNet, ok := addr.(*net.IPNet)
			if !ok {
				continue
			}

			ip := ipNet.IP.To4()
			if ip == nil {
				continue // Not IPv4
			}

			// Skip loopback
			if ip.IsLoopback() {
				continue
			}

			// Return subnet (first 3 octets)
			return fmt.Sprintf("%d.%d.%d", ip[0], ip[1], ip[2]), nil
		}
	}

	return "", fmt.Errorf("could not determine local network")
}

// probePixoo checks if an IP hosts a Pixoo device.
func probePixoo(ctx context.Context, ip string) *DiscoveredDevice {
	// Create a client with short timeout
	client := NewClient(ip)
	client.HTTPClient.Timeout = 500 * time.Millisecond

	// Try to get device info
	probeCtx, cancel := context.WithTimeout(ctx, 500*time.Millisecond)
	defer cancel()

	_, err := client.sendCommand(probeCtx, map[string]string{"Command": "Channel/GetIndex"})
	if err != nil {
		return nil
	}

	return &DiscoveredDevice{
		Name: "Pixoo",
		IP:   ip,
	}
}
