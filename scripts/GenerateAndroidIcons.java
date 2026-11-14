import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import javax.imageio.ImageIO;

public final class GenerateAndroidIcons {
  private static void writeScaled(BufferedImage source, Path target, int size) throws Exception {
    Files.createDirectories(target.getParent());
    BufferedImage output = new BufferedImage(size, size, BufferedImage.TYPE_INT_ARGB);
    Graphics2D graphics = output.createGraphics();
    graphics.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
    graphics.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
    graphics.drawImage(source, 0, 0, size, size, null);
    graphics.dispose();
    ImageIO.write(output, "png", target.toFile());
  }

  public static void main(String[] args) throws Exception {
    if (args.length != 1) throw new IllegalArgumentException("Pass android/app/src/main/res as the output directory");
    Path resources = Paths.get(args[0]);
    BufferedImage icon = ImageIO.read(Paths.get("assets/icon-only.png").toFile());
    BufferedImage foreground = ImageIO.read(Paths.get("assets/icon-foreground.png").toFile());
    BufferedImage monochrome = ImageIO.read(Paths.get("assets/icon-monochrome.png").toFile());
    if (icon == null || foreground == null || monochrome == null) throw new IllegalStateException("CONNECT icon source PNGs are missing");

    int[] sizes = {48, 72, 96, 144, 192};
    String[] densities = {"mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"};
    for (int i = 0; i < sizes.length; i++) {
      Path folder = resources.resolve("mipmap-" + densities[i]);
      writeScaled(icon, folder.resolve("ic_launcher.png"), sizes[i]);
      writeScaled(icon, folder.resolve("ic_launcher_round.png"), sizes[i]);
    }

    Path drawable = resources.resolve("drawable-nodpi");
    writeScaled(foreground, drawable.resolve("ic_launcher_foreground.png"), 1024);
    writeScaled(monochrome, drawable.resolve("ic_launcher_monochrome.png"), 1024);

    Path adaptiveFolder = resources.resolve("mipmap-anydpi-v26");
    Files.createDirectories(adaptiveFolder);
    String adaptiveIcon = """
      <?xml version="1.0" encoding="utf-8"?>
      <adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
        <background android:drawable="@color/connect_icon_background" />
        <foreground android:drawable="@drawable/ic_launcher_foreground" />
        <monochrome android:drawable="@drawable/ic_launcher_monochrome" />
      </adaptive-icon>
      """;
    Files.writeString(adaptiveFolder.resolve("ic_launcher.xml"), adaptiveIcon);
    Files.writeString(adaptiveFolder.resolve("ic_launcher_round.xml"), adaptiveIcon);

    Path values = resources.resolve("values");
    Files.createDirectories(values);
    Files.writeString(values.resolve("connect_icon_background.xml"), """
      <?xml version="1.0" encoding="utf-8"?>
      <resources><color name="connect_icon_background">#F2F2F1</color></resources>
      """);
    System.out.println("Generated CONNECT launcher icons for all Android densities.");
  }
}
