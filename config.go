package main

import (
	"fmt"
	"strings"

	"github.com/knadh/koanf/parsers/toml"
	"github.com/knadh/koanf/providers/env"
	"github.com/knadh/koanf/providers/file"
	"github.com/knadh/koanf/v2"
)

func initConfig(cfgPath string) (*koanf.Koanf, error) {
	k := koanf.New(".")
	if err := k.Load(file.Provider(cfgPath), toml.Parser()); err != nil {
		return nil, fmt.Errorf("error loading config: %v", err)
	}

	k.Load(env.Provider("GULLAK_", ".", func(s string) string {
		return strings.Replace(strings.ToLower(
			strings.TrimPrefix(s, "GULLAK_")), "_", ".", -1)
	}), nil)

	return k, nil
}
