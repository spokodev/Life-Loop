package logging

import (
	"encoding/json"
	"log"
	"os"
	"time"
)

type Logger struct {
	service string
	logger  *log.Logger
}

func New(service string) Logger {
	return Logger{
		service: service,
		logger:  log.New(os.Stdout, "", 0),
	}
}

func (l Logger) Info(message string, fields map[string]any) {
	l.write("info", message, fields)
}

func (l Logger) Error(message string, fields map[string]any) {
	l.write("error", message, fields)
}

func (l Logger) write(level string, message string, fields map[string]any) {
	payload := map[string]any{
		"level":     level,
		"service":   l.service,
		"message":   message,
		"timestamp": time.Now().UTC().Format(time.RFC3339),
	}

	for key, value := range fields {
		payload[key] = value
	}

	encoded, _ := json.Marshal(payload)
	l.logger.Println(string(encoded))
}
