import type { Language } from '../models/project.model.js'

export interface StarterFile {
  path: string
  content: string
}

// The file every new project starts with (US04).
export const STARTER_FILES: Record<Language, StarterFile> = {
  python: {
    path: 'main.py',
    content: 'print("Salut, lume!")\n',
  },
  javascript: {
    path: 'index.js',
    content: "console.log('Salut, lume!')\n",
  },
  java: {
    path: 'Main.java',
    content: `public class Main {
    public static void main(String[] args) {
        System.out.println("Salut, lume!");
    }
}
`,
  },
  cpp: {
    path: 'main.cpp',
    content: `#include <iostream>

int main() {
    std::cout << "Salut, lume!" << std::endl;
    return 0;
}
`,
  },
}
